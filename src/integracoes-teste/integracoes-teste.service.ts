import {
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Card } from '../cards/entities/card.entity';
import { AtorEvento } from '../cards/card-evento.helper';
import { AutomacoesService } from '../automacoes/automacoes.service';
import { IntegracoesService } from '../integracoes/integracoes.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { EmailService } from '../email/email.service';
import { StorageService } from '../storage/storage.service';
import { CardPdfEmissaoService } from '../pdf-modelos/card-pdf-emissao.service';
import { Integracao } from '../integracoes/entities/integracao.entity';
import { StepTipo } from '../integracoes/enums/step-tipo.enum';
import { STEP_EXECUTORS } from '../integracoes/step-executors';
import {
  CHAVES_PROFUNDAS_POR_STEP,
  CHAVES_SEM_INTERPOLACAO_POR_STEP,
  resolverConfigStep,
} from '../integracoes/integracao-config.util';
import { NotificacaoEnfileirada } from '../integracoes/notificacao-enfileirada.interface';
import { TestarStepDto } from './dto/testar-step.dto';

export interface ResultadoTesteStep {
  stepApelido: string;
  tipo: StepTipo;
  entrada: Record<string, unknown>;
  saida: Record<string, unknown>;
}

// Motor de teste interativo (ver PLANO_TESTE_INTERATIVO_INTEGRACOES.md):
// roda UM step de uma integração já salva, agora, contra o estado atual de
// um card real — usando os mesmos STEP_EXECUTORS e o mesmo resolverConfigStep
// da execução de produção (executarSequencia, em IntegracoesService), só que
// fora do grafo (sem calcular alcançáveis/ordem topológica/ramos) e sem
// gravar em integracao_execucoes (teste manual não é auditoria de produção).
//
// Fica num módulo à parte (em vez de dentro de IntegracoesModule) pelo mesmo
// motivo do GatilhoExecucaoModule: os steps de ação chamam
// ctx.automacoesService de verdade (cascata pra automações do processo), e
// nem AutomacoesModule nem IntegracoesModule podem importar um ao outro (ver
// comentário em integracoes.module.ts) — um módulo separado que importa os
// dois resolve isso sem dependência circular.
@Injectable()
export class IntegracaoTesteService {
  constructor(
    @InjectRepository(Integracao)
    private readonly integracaoRepository: Repository<Integracao>,
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
    private readonly automacoesService: AutomacoesService,
    private readonly integracoesService: IntegracoesService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly emailService: EmailService,
    private readonly storageService: StorageService,
    private readonly cardPdfEmissaoService: CardPdfEmissaoService,
    private readonly dataSource: DataSource,
  ) {}

  async testarStep(
    processoId: string,
    integracaoId: string,
    stepApelido: string,
    dto: TestarStepDto,
    ator: AtorEvento,
  ): Promise<ResultadoTesteStep> {
    const integracao = await this.integracaoRepository.findOne({
      where: { id: integracaoId, processoId },
      relations: { steps: true },
    });
    if (!integracao) {
      throw new NotFoundException('Integração não encontrada neste processo');
    }

    const step = integracao.steps.find((s) => s.apelido === stepApelido);
    if (!step) {
      throw new NotFoundException(
        `Step "${stepApelido}" não encontrado nesta integração`,
      );
    }

    const card = await this.cardRepository.findOne({
      where: { id: dto.cardId, processoId },
    });
    if (!card) {
      throw new NotFoundException(
        'Card informado em cardId não encontrado neste processo',
      );
    }

    const executor = STEP_EXECUTORS[step.tipo];
    const saidasPorApelido = new Map(
      Object.entries(dto.saidasAnteriores ?? {}),
    );
    const entradas = resolverConfigStep(
      step.config,
      saidasPorApelido,
      card.campos,
      CHAVES_SEM_INTERPOLACAO_POR_STEP[step.tipo],
      CHAVES_PROFUNDAS_POR_STEP[step.tipo],
    );

    if (!executor.ehGatilho && !executor.permissaoNoExecutor) {
      if (!step.usuarioServicoId) {
        throw new ForbiddenException(
          `Step "${step.apelido}" não tem conta de serviço configurada`,
        );
      }
      const permitido = await this.integracoesService.verificarPermissaoServico(
        step.usuarioServicoId,
        executor.aliasPermissao!,
        processoId,
      );
      if (!permitido) {
        throw new ForbiddenException(
          `Conta de serviço do step "${step.apelido}" sem permissão: ${executor.aliasPermissao}`,
        );
      }
    }

    const cardsCriados: Card[] = [];
    const cardsAtualizados = new Map<string, Card>();
    const emailsEnfileirados: string[] = [];
    const notificacoesEnfileiradas: NotificacaoEnfileirada[] = [];

    let saida: Record<string, unknown>;
    try {
      saida = await this.dataSource.transaction(async (manager) => {
        return executor.executar({
          manager,
          card,
          step,
          entradas,
          ator,
          automacoesService: this.automacoesService,
          integracoesService: this.integracoesService,
          emailService: this.emailService,
          storageService: this.storageService,
          cardPdfEmissaoService: this.cardPdfEmissaoService,
          cardsCriados,
          cardsAtualizados,
          emailsEnfileirados,
          notificacoesEnfileiradas,
          profundidade: 0,
        });
      });
    } catch (erro) {
      // Exceptions "de negócio" (NotFoundException, ForbiddenException, a
      // própria UnprocessableEntityException que HTTP_REQUEST/CODIGO_
      // JAVASCRIPT etc. já lançam) já carregam status + mensagem úteis pro
      // front — sobem como vieram. Qualquer outra coisa (ex.: TypeError de
      // dentro do script do usuário em CODIGO_JAVASCRIPT, referenciando um
      // campo que não existe) é convertida pra 422 com a mensagem real:
      // sem isso, o NestJS esconde o detalhe atrás de um 500 genérico
      // "Internal server error" (proteção padrão contra vazar stack trace
      // interno), e quem está testando o step não teria nenhuma pista do
      // que quebrou sem abrir o log do servidor.
      if (erro instanceof HttpException) {
        throw erro;
      }
      throw new UnprocessableEntityException(
        `Step "${step.apelido}" (${step.tipo}) falhou ao executar: ${(erro as Error).message}`,
      );
    }

    // Mesma regra de sempre (ver GatilhoExecucaoProcessor): notificação em
    // tempo real e envio de e-mail só depois que a transação já comitou —
    // efeitos colaterais em cascata deste teste (ex.: ACAO_ATUALIZAR_CAMPO
    // disparando outra automação/integração do processo) são tão reais
    // quanto os de uma execução de produção.
    for (const cardCriado of cardsCriados) {
      this.realtimeGateway.emitirCardCriado(cardCriado.processoId, cardCriado);
    }
    for (const cardAtualizado of cardsAtualizados.values()) {
      this.realtimeGateway.emitirCardAtualizado(
        cardAtualizado.processoId,
        cardAtualizado,
      );
    }
    for (const notificacao of notificacoesEnfileiradas) {
      this.realtimeGateway.emitirNotificacao(
        notificacao.processoId,
        notificacao,
      );
    }
    await this.emailService.despacharEnvios(emailsEnfileirados);

    return {
      stepApelido: step.apelido,
      tipo: step.tipo,
      entrada: entradas,
      saida,
    };
  }
}
