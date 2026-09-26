import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Card } from '../cards/entities/card.entity';
import { CardPdfEmissao } from '../cards/entities/card-pdf-emissao.entity';
import { CardPdfEmissaoStatus } from '../cards/enums/card-pdf-emissao-status.enum';
import { CardEventoTipo } from '../cards/enums/card-evento-tipo.enum';
import { registrarEventoCard } from '../cards/card-evento.helper';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { PdfModelo } from './entities/pdf-modelo.entity';
import { PdfRendererService } from './pdf-renderer.service';
import { interpolarTemplatePdf, montarContextoPdf } from './pdf-template.util';
import { StorageService } from '../storage/storage.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  FILA_PDF_EMISSAO,
  PdfEmissaoJobPayload,
} from './card-pdf-emissao.types';

// Roda fora da transação/resposta HTTP que criou a emissão (ver
// CardPdfEmissaoService.emitir) — Puppeteer é I/O pesado (chega a 1-3s),
// nunca deveria segurar uma transação de banco aberta. Falha aqui marca a
// emissão como ERRO (não relança: sem retry automático, igual
// GatilhoExecucaoProcessor, pra não duplicar upload no MinIO).
@Processor(FILA_PDF_EMISSAO)
export class CardPdfEmissaoProcessor extends WorkerHost {
  private readonly logger = new Logger(CardPdfEmissaoProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly pdfRendererService: PdfRendererService,
    private readonly storageService: StorageService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {
    super();
  }

  async process(job: Job<PdfEmissaoJobPayload>): Promise<void> {
    const { emissaoId } = job.data;
    const emissao = await this.dataSource.manager.findOne(CardPdfEmissao, {
      where: { id: emissaoId },
    });
    if (!emissao) {
      // Card foi removido (cascade) entre o enfileiramento e este job rodar.
      return;
    }

    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: emissao.cardId },
    });
    if (!card) {
      return;
    }

    try {
      const [processo, fase, modelo] = await Promise.all([
        this.dataSource.manager.findOneOrFail(Processo, {
          where: { id: card.processoId },
        }),
        this.dataSource.manager.findOneOrFail(Fase, {
          where: { id: card.faseAtualId },
        }),
        emissao.pdfModeloId
          ? this.dataSource.manager.findOne(PdfModelo, {
              where: { id: emissao.pdfModeloId },
            })
          : Promise.resolve(null),
      ]);
      if (!modelo) {
        throw new Error('Modelo de PDF não existe mais');
      }

      const contexto = montarContextoPdf(card, processo, fase);
      const html = interpolarTemplatePdf(modelo.html, contexto);
      const buffer = await this.pdfRendererService.renderizarPdf(html);

      const objectKey = `cards/${card.id}/pdf-emissoes/${randomUUID()}.pdf`;
      await this.storageService.salvar(objectKey, buffer, 'application/pdf');

      await this.dataSource.transaction(async (manager) => {
        await manager.update(CardPdfEmissao, emissao.id, {
          status: CardPdfEmissaoStatus.CONCLUIDO,
          objectKey,
          concluidoEm: new Date(),
        });
        await registrarEventoCard(manager, {
          cardId: card.id,
          tipo: CardEventoTipo.PDF_EMITIDO,
          ator: { usuarioId: emissao.geradoPorId, automatico: false },
          dadosDepois: {
            emissaoId: emissao.id,
            modeloId: modelo.id,
            modeloNome: emissao.modeloNomeSnapshot,
          },
        });
      });

      this.realtimeGateway.emitirPdfEmissaoAtualizada(card.processoId, {
        cardId: card.id,
        emissaoId: emissao.id,
        status: CardPdfEmissaoStatus.CONCLUIDO,
      });
    } catch (erro) {
      const mensagem = (erro as Error).message;
      this.logger.warn(
        `Falha ao gerar PDF (emissaoId=${emissaoId}, cardId=${card.id}): ${mensagem}`,
      );
      await this.dataSource.manager.update(CardPdfEmissao, emissao.id, {
        status: CardPdfEmissaoStatus.ERRO,
        erroMensagem: mensagem,
      });
      this.realtimeGateway.emitirPdfEmissaoAtualizada(card.processoId, {
        cardId: card.id,
        emissaoId: emissao.id,
        status: CardPdfEmissaoStatus.ERRO,
      });
    }
  }
}
