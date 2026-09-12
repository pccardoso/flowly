import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { DataSource } from 'typeorm';
import { Card } from './entities/card.entity';
import { CardAnexo } from './entities/card-anexo.entity';
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

  async enviar(cardId: string, arquivo: AnexoParaUpload): Promise<CardAnexo> {
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
      const anexo = this.dataSource.manager.create(CardAnexo, {
        cardId,
        nomeOriginal: arquivo.originalname,
        objectKey,
        mimeType: arquivo.mimetype,
        tamanho: arquivo.size,
      });
      return await this.dataSource.manager.save(anexo);
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

  async remover(cardId: string, anexoId: string): Promise<void> {
    const anexo = await this.dataSource.manager.findOne(CardAnexo, {
      where: { id: anexoId, cardId },
    });
    if (!anexo) {
      throw new NotFoundException('Anexo não encontrado');
    }

    await this.dataSource.manager.delete(CardAnexo, anexo.id);
    await this.storageService.remover(anexo.objectKey);
  }
}
