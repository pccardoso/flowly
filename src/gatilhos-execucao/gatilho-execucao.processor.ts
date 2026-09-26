import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { Card } from '../cards/entities/card.entity';
import {
  dispararGatilhoIntegracaoCardCriado,
  dispararGatilhosCampoAtualizado,
  dispararGatilhosCardEntrouNaFase,
  dispararGatilhoVencimento,
} from '../cards/gatilho-dispatch.helper';
import { StepTipo } from '../integracoes/enums/step-tipo.enum';
import { AutomacoesService } from '../automacoes/automacoes.service';
import { IntegracoesService } from '../integracoes/integracoes.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { EmailService } from '../email/email.service';
import { NotificacaoEnfileirada } from '../integracoes/notificacao-enfileirada.interface';
import {
  FILA_GATILHO_EXECUCAO,
  GatilhoExecucaoJobPayload,
} from './gatilho-execucao.types';

// Processa, fora da transação/resposta HTTP do save que disparou o evento
// (ver GatilhoExecucaoDispatchService), a reação de automações/integrações a
// um evento de card. Relê o card do zero — nunca reaproveita um snapshot de
// quando o gatilho foi originalmente enfileirado, porque o card pode ter
// mudado de novo entre o commit do save e este job rodar.
//
// Falha aqui derruba só a transação desta cadeia (nunca o save original, que
// já comitou antes de este job existir); a auditoria de erro sobrevive à
// parte, numa transação independente (ver
// AutomacoesService/IntegracoesService, registrarErro*ForaDaTransacao), pro
// gerente do processo poder revisar o que quebrou.
@Processor(FILA_GATILHO_EXECUCAO)
export class GatilhoExecucaoProcessor extends WorkerHost {
  private readonly logger = new Logger(GatilhoExecucaoProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly automacoesService: AutomacoesService,
    private readonly integracoesService: IntegracoesService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  async process(job: Job<GatilhoExecucaoJobPayload>): Promise<void> {
    const payload = job.data;
    const cardsCriados: Card[] = [];
    const cardsAtualizados = new Map<string, Card>();
    const emailsEnfileirados: string[] = [];
    const notificacoesEnfileiradas: NotificacaoEnfileirada[] = [];

    try {
      await this.dataSource.transaction(async (manager) => {
        const card = await manager.findOne(Card, {
          where: { id: payload.cardId },
        });
        if (!card) {
          // Card foi removido entre o enfileiramento e a execução deste
          // job — nada a reagir.
          return;
        }

        switch (payload.tipo) {
          case 'CARD_CRIADO':
            await dispararGatilhoIntegracaoCardCriado(
              manager,
              card,
              payload.ator,
              this.integracoesService,
              this.automacoesService,
              cardsCriados,
              0,
              cardsAtualizados,
              emailsEnfileirados,
              notificacoesEnfileiradas,
            );
            await dispararGatilhosCardEntrouNaFase(
              manager,
              card,
              payload.faseId,
              this.automacoesService,
              this.integracoesService,
              cardsCriados,
              0,
              cardsAtualizados,
              emailsEnfileirados,
              notificacoesEnfileiradas,
            );
            return;
          case 'CARD_ENTROU_NA_FASE':
            await dispararGatilhosCardEntrouNaFase(
              manager,
              card,
              payload.faseId,
              this.automacoesService,
              this.integracoesService,
              cardsCriados,
              0,
              cardsAtualizados,
              emailsEnfileirados,
              notificacoesEnfileiradas,
            );
            return;
          case 'CARD_VENCIDO':
          case 'CARD_PRESTES_A_VENCER':
            // A data pode ter mudado (ou sido removida) entre a varredura e
            // este job: aí o disparo já não vale mais.
            if (
              !card.dataVencimento ||
              card.dataVencimento.getTime() !==
                new Date(payload.dataVencimento).getTime()
            ) {
              return;
            }
            await dispararGatilhoVencimento(
              manager,
              card,
              payload.tipo === 'CARD_VENCIDO'
                ? StepTipo.GATILHO_CARD_VENCIDO
                : StepTipo.GATILHO_CARD_PRESTES_A_VENCER,
              this.automacoesService,
              this.integracoesService,
              cardsCriados,
              0,
              cardsAtualizados,
              emailsEnfileirados,
              notificacoesEnfileiradas,
            );
            return;
          case 'CAMPO_ATUALIZADO':
            await dispararGatilhosCampoAtualizado(
              manager,
              card,
              payload.camposAlterados,
              this.automacoesService,
              this.integracoesService,
              cardsCriados,
              0,
              cardsAtualizados,
              emailsEnfileirados,
              notificacoesEnfileiradas,
            );
            return;
        }
      });
    } catch (erro) {
      this.logger.warn(
        `Cadeia de automação/integração falhou em background (cardId=${payload.cardId}, tipo=${payload.tipo}): ${(erro as Error).message}`,
      );
      // Não relança: a auditoria de erro já foi gravada (numa transação
      // própria) pelos services de Automacao/Integracao. Relançar faria o
      // BullMQ tentar de novo e duplicar efeitos colaterais já aplicados
      // antes do step que falhou.
      return;
    }

    for (const card of cardsCriados) {
      this.realtimeGateway.emitirCardCriado(card.processoId, card);
    }
    for (const card of cardsAtualizados.values()) {
      this.realtimeGateway.emitirCardAtualizado(card.processoId, card);
    }
    for (const notificacao of notificacoesEnfileiradas) {
      this.realtimeGateway.emitirNotificacao(
        notificacao.processoId,
        notificacao,
      );
    }
    await this.emailService.despacharEnvios(emailsEnfileirados);
  }
}
