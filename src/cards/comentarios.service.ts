import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Card } from './entities/card.entity';
import { CardComentario } from './entities/card-comentario.entity';
import { CardComentarioAnexo } from './entities/card-comentario-anexo.entity';
import { registrarEventoCard } from './card-evento.helper';
import { CardEventoTipo } from './enums/card-evento-tipo.enum';
import { CreateComentarioDto } from './dto/create-comentario.dto';
import { AnexoParaUpload, CardAnexosService } from './anexos.service';
import { StorageService } from '../storage/storage.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export const MAX_ANEXOS_POR_COMENTARIO = 10;

export interface AnexoResumo {
  id: string;
  nomeOriginal: string;
  mimeType: string;
  tamanho: number;
}

export type ComentarioComAnexos = CardComentario & { anexos: AnexoResumo[] };

// Carrega, em uma única consulta, os anexos vinculados a cada comentário.
// Exportado porque o detalhe do card (CardsService) também precisa dele.
export async function carregarAnexosDosComentarios(
  manager: EntityManager,
  comentarioIds: string[],
): Promise<Map<string, AnexoResumo[]>> {
  const porComentario = new Map<string, AnexoResumo[]>();
  if (comentarioIds.length === 0) {
    return porComentario;
  }

  const vinculos = await manager.find(CardComentarioAnexo, {
    where: { comentarioId: In(comentarioIds) },
    relations: { anexo: true },
  });
  vinculos.sort(
    (a, b) => a.anexo.createdAt.getTime() - b.anexo.createdAt.getTime(),
  );
  for (const vinculo of vinculos) {
    const lista = porComentario.get(vinculo.comentarioId) ?? [];
    lista.push({
      id: vinculo.anexo.id,
      nomeOriginal: vinculo.anexo.nomeOriginal,
      mimeType: vinculo.anexo.mimeType,
      tamanho: vinculo.anexo.tamanho,
    });
    porComentario.set(vinculo.comentarioId, lista);
  }
  return porComentario;
}

@Injectable()
export class ComentariosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cardAnexosService: CardAnexosService,
    private readonly storageService: StorageService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async criar(
    cardId: string,
    dto: CreateComentarioDto,
    usuarioId: string,
    arquivos: AnexoParaUpload[] = [],
  ): Promise<ComentarioComAnexos> {
    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: cardId },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    const texto = dto.texto ?? '';
    if (texto.trim() === '' && arquivos.length === 0) {
      throw new BadRequestException(
        'Informe o texto do comentário ou anexe pelo menos um arquivo',
      );
    }
    if (arquivos.length > MAX_ANEXOS_POR_COMENTARIO) {
      throw new BadRequestException(
        `Máximo de ${MAX_ANEXOS_POR_COMENTARIO} arquivos por comentário`,
      );
    }

    const objectKeys = await this.enviarParaStorage(cardId, arquivos);

    let comentarioId: string;
    try {
      comentarioId = await this.dataSource.transaction(async (manager) => {
        const comentario = await manager.save(
          manager.create(CardComentario, { cardId, usuarioId, texto }),
        );

        const anexoIds: string[] = [];
        for (const [i, arquivo] of arquivos.entries()) {
          const anexo = await this.cardAnexosService.registrar(
            manager,
            cardId,
            arquivo,
            objectKeys[i],
            usuarioId,
          );
          await manager.save(
            manager.create(CardComentarioAnexo, {
              comentarioId: comentario.id,
              anexoId: anexo.id,
            }),
          );
          anexoIds.push(anexo.id);
        }

        await registrarEventoCard(manager, {
          cardId,
          tipo: CardEventoTipo.COMENTARIO_CRIADO,
          ator: { usuarioId, automatico: false },
          dadosDepois: { comentarioId: comentario.id, texto, anexoIds },
        });
        return comentario.id;
      });
    } catch (erro) {
      // Evita objetos órfãos no MinIO se a transação falhar.
      await this.removerDoStorage(objectKeys);
      throw erro;
    }

    if (arquivos.length > 0) {
      // Só depois do commit; o card ganhou anexos, então quem está com ele
      // aberto precisa recarregar a aba de anexos.
      this.realtimeGateway.emitirCardAtualizado(card.processoId, card);
    }
    return this.buscarComUsuario(comentarioId);
  }

  async listar(cardId: string): Promise<ComentarioComAnexos[]> {
    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: cardId },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    const comentarios = await this.dataSource.manager.find(CardComentario, {
      where: { cardId },
      relations: { usuario: true },
      order: { createdAt: 'ASC' },
    });
    const anexosPorComentario = await carregarAnexosDosComentarios(
      this.dataSource.manager,
      comentarios.map((c) => c.id),
    );
    return comentarios.map((c) =>
      Object.assign(c, { anexos: anexosPorComentario.get(c.id) ?? [] }),
    );
  }

  // Policy: só o próprio autor do comentário pode editar ou remover.
  // A edição mexe só no texto — anexos não são adicionados/removidos aqui
  // (remover o arquivo é feito pelo anexo do card, DELETE .../anexos/:id).
  async editar(
    cardId: string,
    comentarioId: string,
    dto: CreateComentarioDto,
    usuarioId: string,
  ): Promise<ComentarioComAnexos> {
    const comentario = await this.buscarDoCard(cardId, comentarioId);
    this.verificarDono(comentario, usuarioId);

    const texto = dto.texto ?? '';
    if (texto.trim() === '') {
      const totalAnexos = await this.dataSource.manager.count(
        CardComentarioAnexo,
        { where: { comentarioId } },
      );
      if (totalAnexos === 0) {
        throw new BadRequestException(
          'O texto não pode ficar vazio em um comentário sem anexos',
        );
      }
    }

    const textoAntigo = comentario.texto;
    await this.dataSource.transaction(async (manager) => {
      comentario.texto = texto;
      await manager.save(comentario);
      await registrarEventoCard(manager, {
        cardId,
        tipo: CardEventoTipo.COMENTARIO_EDITADO,
        ator: { usuarioId, automatico: false },
        dadosAntes: { comentarioId, texto: textoAntigo },
        dadosDepois: { comentarioId, texto: comentario.texto },
      });
    });
    return this.buscarComUsuario(comentario.id);
  }

  // Remove só o comentário e seus vínculos: os arquivos continuam nos anexos
  // do card (podem ter sido usados por outras partes do fluxo).
  async remover(
    cardId: string,
    comentarioId: string,
    usuarioId: string,
  ): Promise<void> {
    const comentario = await this.buscarDoCard(cardId, comentarioId);
    this.verificarDono(comentario, usuarioId);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(CardComentario, comentario.id);
      await registrarEventoCard(manager, {
        cardId,
        tipo: CardEventoTipo.COMENTARIO_REMOVIDO,
        ator: { usuarioId, automatico: false },
        dadosAntes: { comentarioId, texto: comentario.texto },
      });
    });
  }

  private async enviarParaStorage(
    cardId: string,
    arquivos: AnexoParaUpload[],
  ): Promise<string[]> {
    const objectKeys = arquivos.map((arquivo) =>
      this.cardAnexosService.gerarObjectKey(cardId, arquivo),
    );
    const resultados = await Promise.allSettled(
      arquivos.map((arquivo, i) =>
        this.storageService.salvar(
          objectKeys[i],
          arquivo.buffer,
          arquivo.mimetype,
        ),
      ),
    );
    const falha = resultados.find((r) => r.status === 'rejected');
    if (falha) {
      // Tudo-ou-nada: apaga o que já subiu antes de propagar o erro.
      await this.removerDoStorage(objectKeys);
      throw falha.reason;
    }
    return objectKeys;
  }

  private async removerDoStorage(objectKeys: string[]): Promise<void> {
    await Promise.all(
      objectKeys.map((key) =>
        this.storageService.remover(key).catch(() => undefined),
      ),
    );
  }

  private async buscarDoCard(
    cardId: string,
    comentarioId: string,
  ): Promise<CardComentario> {
    const comentario = await this.dataSource.manager.findOne(CardComentario, {
      where: { id: comentarioId, cardId },
    });
    if (!comentario) {
      throw new NotFoundException('Comentário não encontrado');
    }
    return comentario;
  }

  private verificarDono(comentario: CardComentario, usuarioId: string): void {
    if (comentario.usuarioId !== usuarioId) {
      throw new ForbiddenException(
        'Apenas o autor do comentário pode alterá-lo ou removê-lo',
      );
    }
  }

  private async buscarComUsuario(id: string): Promise<ComentarioComAnexos> {
    const comentario = await this.dataSource.manager.findOne(CardComentario, {
      where: { id },
      relations: { usuario: true },
    });
    if (!comentario) {
      throw new NotFoundException('Comentário não encontrado');
    }
    const anexos = await carregarAnexosDosComentarios(this.dataSource.manager, [
      id,
    ]);
    return Object.assign(comentario, { anexos: anexos.get(id) ?? [] });
  }
}
