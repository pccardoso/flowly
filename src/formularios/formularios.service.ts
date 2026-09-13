import {
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { Card } from '../cards/entities/card.entity';
import { CardAnexo } from '../cards/entities/card-anexo.entity';
import { CardsService } from '../cards/cards.service';
import { AnexoParaUpload, CardAnexosService } from '../cards/anexos.service';
import { CampoFormulario } from '../processos/formulario/campo-formulario.interface';
import { PreencherFormularioEntradaDto } from './dto/preencher-formulario-entrada.dto';

export interface FormularioExternoResposta {
  processoId: string;
  processoNome: string;
  requerAutenticacao: boolean;
  campos: CampoFormulario[];
}

// Link externo = mesclagem de ids (processoId, e futuramente + faseId), não
// um token gerado/armazenado — ver CLAUDE.md/conversa: "o link não é
// gerado, ele já existe". FormularioExternoGuard cuida de exigir ou não JWT
// antes de qualquer método daqui rodar.
@Injectable()
export class FormulariosService {
  constructor(
    @InjectRepository(Processo)
    private readonly processoRepository: Repository<Processo>,
    @InjectRepository(Fase)
    private readonly faseRepository: Repository<Fase>,
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
    private readonly cardsService: CardsService,
    private readonly cardAnexosService: CardAnexosService,
  ) {}

  private async buscarProcessoOuFalhar(processoId: string): Promise<Processo> {
    const processo = await this.processoRepository.findOne({
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }
    return processo;
  }

  async obterFormularioEntrada(
    processoId: string,
  ): Promise<FormularioExternoResposta> {
    const processo = await this.buscarProcessoOuFalhar(processoId);
    return {
      processoId: processo.id,
      processoNome: processo.nome,
      requerAutenticacao: processo.formularioExternoRequerAutenticacao,
      campos: processo.formularioEntrada,
    };
  }

  // Reaproveita CardsService.criar (mesma transação/gatilho
  // CARD_ENTROU_NA_FASE/notificação websocket da criação manual). `usuarioId`
  // vem null quando a submissão foi anônima (formulário público sem token) —
  // o evento CARD_CRIADO do histórico fica sem autor identificável nesse
  // caso, sem quebrar (ver CriarCardEmFaseParams/AtorEvento).
  async criarCardViaFormularioEntrada(
    processoId: string,
    dto: PreencherFormularioEntradaDto,
    usuarioId: string | null,
  ): Promise<Card> {
    await this.buscarProcessoOuFalhar(processoId);
    return this.cardsService.criar(
      {
        processoId,
        titulo: dto.titulo,
        campos: dto.campos,
      },
      usuarioId,
    );
  }

  // Mesma exceção de autenticação do resto do módulo (ver
  // FormularioExternoGuard) — deliberadamente NÃO passa por
  // CardsController.enviarAnexo (que exige card.editar via PermissoesGuard),
  // porque quem preenche o formulário externo não tem grupo/permissão
  // nenhuma. Em vez disso valida só que o card pertence ao processo do link
  // (senão daria pra anexar arquivo em qualquer card só adivinhando o id).
  async enviarAnexoViaFormularioEntrada(
    processoId: string,
    cardId: string,
    arquivo: AnexoParaUpload,
    usuarioId: string | null,
  ): Promise<CardAnexo> {
    await this.buscarProcessoOuFalhar(processoId);
    const card = await this.cardRepository.findOne({
      where: { id: cardId, processoId },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado neste processo');
    }
    return this.cardAnexosService.enviar(cardId, arquivo, usuarioId);
  }

  // Ainda não existe formulário de fase (ver CLAUDE.md) — só deixa a rota e
  // a validação de processo/fase prontas pra quando isso for implementado.
  async obterFormularioFase(
    processoId: string,
    faseId: string,
  ): Promise<never> {
    await this.buscarProcessoOuFalhar(processoId);
    const fase = await this.faseRepository.findOne({
      where: { id: faseId, processoId },
    });
    if (!fase) {
      throw new NotFoundException('Fase não encontrada neste processo');
    }
    throw new NotImplementedException(
      'Formulário de fase ainda não implementado',
    );
  }

  async criarCardViaFormularioFase(
    processoId: string,
    faseId: string,
  ): Promise<never> {
    return this.obterFormularioFase(processoId, faseId);
  }
}
