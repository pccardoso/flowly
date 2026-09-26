import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Card } from '../cards/entities/card.entity';
import { CardAnexo } from '../cards/entities/card-anexo.entity';
import { CardEventoTipo } from '../cards/enums/card-evento-tipo.enum';
import { AtorEvento, registrarEventoCard } from '../cards/card-evento.helper';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { PdfRendererService } from './pdf-renderer.service';
import { interpolarTemplatePdf, montarContextoPdf } from './pdf-template.util';
import { CardPdfEmissao } from '../cards/entities/card-pdf-emissao.entity';
import { CardPdfEmissaoStatus } from '../cards/enums/card-pdf-emissao-status.enum';
import { PdfModelo } from './entities/pdf-modelo.entity';
import { StorageService } from '../storage/storage.service';
import {
  FILA_PDF_EMISSAO,
  PdfEmissaoJobPayload,
} from './card-pdf-emissao.types';

export interface EmissaoDownload {
  emissao: CardPdfEmissao;
  stream: Readable;
}

// Orquestra o lado "usuário" da emissão (criar o registro + enfileirar);
// quem efetivamente renderiza e sobe o PDF é o CardPdfEmissaoProcessor, em
// background — ver esse arquivo pro fluxo completo.
@Injectable()
export class CardPdfEmissaoService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly pdfRendererService: PdfRendererService,
    @InjectQueue(FILA_PDF_EMISSAO)
    private readonly fila: Queue<PdfEmissaoJobPayload>,
  ) {}

  async emitir(
    cardId: string,
    modeloId: string,
    usuarioId: string,
  ): Promise<CardPdfEmissao> {
    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: cardId },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    const modelo = await this.dataSource.manager.findOne(PdfModelo, {
      where: { id: modeloId, processoId: card.processoId },
    });
    if (!modelo) {
      throw new NotFoundException('Modelo de PDF não encontrado');
    }

    const emissao = await this.dataSource.manager.save(
      this.dataSource.manager.create(CardPdfEmissao, {
        cardId,
        pdfModeloId: modelo.id,
        modeloNomeSnapshot: modelo.nome,
        status: CardPdfEmissaoStatus.PROCESSANDO,
        geradoPorId: usuarioId,
      }),
    );

    await this.fila.add(
      'emitir',
      { emissaoId: emissao.id },
      { attempts: 1, removeOnComplete: true, removeOnFail: 100 },
    );

    return emissao;
  }

  // Timeout menor que o da emissão em fila: aqui a renderização acontece
  // dentro da transação do step (segura uma conexão do pool do banco), então
  // preferimos falhar (e desfazer a cadeia) a segurar a conexão por 30s.
  static readonly TIMEOUT_RENDERIZACAO_STEP_MS = 15000;

  // Versão síncrona de emitir() pra o step ACAO_EMITIR_PDF: renderiza aqui
  // mesmo (sem fila), dentro da transação do chamador (`manager`), então o PDF
  // enxerga os campos que outros steps da mesma cadeia acabaram de gravar. O
  // resultado é um CardAnexo (é isso que o step EMAIL sabe anexar) mais a
  // linha de histórico CardPdfEmissao já CONCLUIDO — cada um com seu próprio
  // objeto no MinIO, pra remover o anexo não quebrar o download da emissão.
  async emitirNoStep(
    manager: EntityManager,
    cardId: string,
    modeloId: string,
    ator: AtorEvento,
  ): Promise<{ anexoId: string; emissaoId: string; nome: string }> {
    // Recarrega o card (em vez de usar o do contexto) pra pegar o estado mais
    // recente dentro da transação.
    const card = await manager.findOne(Card, { where: { id: cardId } });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }
    const modelo = await manager.findOne(PdfModelo, {
      where: { id: modeloId, processoId: card.processoId },
    });
    if (!modelo) {
      throw new NotFoundException(
        `Modelo de PDF "${modeloId}" não encontrado neste processo`,
      );
    }
    const [processo, fase] = await Promise.all([
      manager.findOneOrFail(Processo, { where: { id: card.processoId } }),
      manager.findOneOrFail(Fase, { where: { id: card.faseAtualId } }),
    ]);

    const html = interpolarTemplatePdf(
      modelo.html,
      montarContextoPdf(card, processo, fase),
    );
    const buffer = await this.pdfRendererService.renderizarPdf(html, {
      timeoutMs: CardPdfEmissaoService.TIMEOUT_RENDERIZACAO_STEP_MS,
    });

    const nome = `${modelo.nome}.pdf`;
    const objectKeyEmissao = `cards/${card.id}/pdf-emissoes/${randomUUID()}.pdf`;
    const objectKeyAnexo = `cards/${card.id}/${randomUUID()}-${nome}`;
    await this.storageService.salvar(
      objectKeyEmissao,
      buffer,
      'application/pdf',
    );
    await this.storageService.salvar(objectKeyAnexo, buffer, 'application/pdf');

    const emissao = await manager.save(
      manager.create(CardPdfEmissao, {
        cardId: card.id,
        pdfModeloId: modelo.id,
        modeloNomeSnapshot: modelo.nome,
        status: CardPdfEmissaoStatus.CONCLUIDO,
        objectKey: objectKeyEmissao,
        geradoPorId: ator.usuarioId,
        concluidoEm: new Date(),
      }),
    );
    const anexo = await manager.save(
      manager.create(CardAnexo, {
        cardId: card.id,
        nomeOriginal: nome,
        objectKey: objectKeyAnexo,
        mimeType: 'application/pdf',
        tamanho: buffer.length,
      }),
    );
    await registrarEventoCard(manager, {
      cardId: card.id,
      tipo: CardEventoTipo.PDF_EMITIDO,
      ator,
      dadosDepois: {
        emissaoId: emissao.id,
        modeloId: modelo.id,
        modeloNome: modelo.nome,
      },
    });
    await registrarEventoCard(manager, {
      cardId: card.id,
      tipo: CardEventoTipo.ANEXO_ADICIONADO,
      ator,
      dadosDepois: { anexoId: anexo.id, nomeOriginal: anexo.nomeOriginal },
    });

    return { anexoId: anexo.id, emissaoId: emissao.id, nome };
  }

  async listar(cardId: string): Promise<CardPdfEmissao[]> {
    return this.dataSource.manager.find(CardPdfEmissao, {
      where: { cardId },
      order: { createdAt: 'DESC' },
    });
  }

  async buscar(cardId: string, emissaoId: string): Promise<CardPdfEmissao> {
    const emissao = await this.dataSource.manager.findOne(CardPdfEmissao, {
      where: { id: emissaoId, cardId },
    });
    if (!emissao) {
      throw new NotFoundException('Emissão de PDF não encontrada');
    }
    return emissao;
  }

  async baixar(cardId: string, emissaoId: string): Promise<EmissaoDownload> {
    const emissao = await this.buscar(cardId, emissaoId);
    if (emissao.status === CardPdfEmissaoStatus.ERRO) {
      throw new ConflictException(
        `Emissão falhou: ${emissao.erroMensagem ?? 'erro desconhecido'}`,
      );
    }
    if (
      emissao.status !== CardPdfEmissaoStatus.CONCLUIDO ||
      !emissao.objectKey
    ) {
      throw new ConflictException('PDF ainda está sendo processado');
    }
    const stream = await this.storageService.obterStream(emissao.objectKey);
    return { emissao, stream };
  }
}
