import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { DataSource } from 'typeorm';
import { Card } from './entities/card.entity';
import { CardAnexo } from './entities/card-anexo.entity';
import { registrarEventoCard } from './card-evento.helper';
import { CardEventoTipo } from './enums/card-evento-tipo.enum';
import { StorageService } from '../storage/storage.service';

export interface AnexoParaUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface AnexoDownload {
  anexo: CardAnexo;
  stream: Readable;
}

@Injectable()
export class CardAnexosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
  ) {}

  async enviar(
    cardId: string,
    arquivo: AnexoParaUpload,
    usuarioId: string | null,
  ): Promise<CardAnexo> {
    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: cardId },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    const objectKey = `cards/${cardId}/${randomUUID()}-${arquivo.originalname}`;
    await this.storageService.salvar(
      objectKey,
      arquivo.buffer,
      arquivo.mimetype,
    );

    try {
      return await this.dataSource.transaction(async (manager) => {
        const anexo = await manager.save(
          manager.create(CardAnexo, {
            cardId,
            nomeOriginal: arquivo.originalname,
            objectKey,
            mimeType: arquivo.mimetype,
            tamanho: arquivo.size,
          }),
        );
        await registrarEventoCard(manager, {
          cardId,
          tipo: CardEventoTipo.ANEXO_ADICIONADO,
          ator: { usuarioId, automatico: false },
          dadosDepois: {
            anexoId: anexo.id,
            nomeOriginal: anexo.nomeOriginal,
          },
        });
        return anexo;
      });
    } catch (erro) {
      // Evita objeto órfão no MinIO se o registro da metadata falhar.
      await this.storageService.remover(objectKey).catch(() => undefined);
      throw erro;
    }
  }

  async listar(cardId: string): Promise<CardAnexo[]> {
    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: cardId },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    return this.dataSource.manager.find(CardAnexo, {
      where: { cardId },
      order: { createdAt: 'ASC' },
    });
  }

  async baixar(cardId: string, anexoId: string): Promise<AnexoDownload> {
    const anexo = await this.dataSource.manager.findOne(CardAnexo, {
      where: { id: anexoId, cardId },
    });
    if (!anexo) {
      throw new NotFoundException('Anexo não encontrado');
    }

    const stream = await this.storageService.obterStream(anexo.objectKey);
    return { anexo, stream };
  }

  async remover(
    cardId: string,
    anexoId: string,
    usuarioId: string,
  ): Promise<void> {
    const anexo = await this.dataSource.manager.findOne(CardAnexo, {
      where: { id: anexoId, cardId },
    });
    if (!anexo) {
      throw new NotFoundException('Anexo não encontrado');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(CardAnexo, anexo.id);
      await registrarEventoCard(manager, {
        cardId,
        tipo: CardEventoTipo.ANEXO_REMOVIDO,
        ator: { usuarioId, automatico: false },
        dadosAntes: { anexoId: anexo.id, nomeOriginal: anexo.nomeOriginal },
      });
    });
    await this.storageService.remover(anexo.objectKey);
  }
}
