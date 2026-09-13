import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Card } from './entities/card.entity';
import { CardComentario } from './entities/card-comentario.entity';
import { registrarEventoCard } from './card-evento.helper';
import { CardEventoTipo } from './enums/card-evento-tipo.enum';
import { CreateComentarioDto } from './dto/create-comentario.dto';

@Injectable()
export class ComentariosService {
  constructor(private readonly dataSource: DataSource) {}

  async criar(
    cardId: string,
    dto: CreateComentarioDto,
    usuarioId: string,
  ): Promise<CardComentario> {
    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: cardId },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    const comentario = await this.dataSource.transaction(async (manager) => {
      const comentario = await manager.save(
        manager.create(CardComentario, {
          cardId,
          usuarioId,
          texto: dto.texto,
        }),
      );
      await registrarEventoCard(manager, {
        cardId,
        tipo: CardEventoTipo.COMENTARIO_CRIADO,
        ator: { usuarioId, automatico: false },
        dadosDepois: { comentarioId: comentario.id, texto: comentario.texto },
      });
      return comentario;
    });
    return this.buscarComUsuario(comentario.id);
  }

  async listar(cardId: string): Promise<CardComentario[]> {
    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: cardId },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    return this.dataSource.manager.find(CardComentario, {
      where: { cardId },
      relations: { usuario: true },
      order: { createdAt: 'ASC' },
    });
  }

  // Policy: só o próprio autor do comentário pode editar ou remover.
  async editar(
    cardId: string,
    comentarioId: string,
    dto: CreateComentarioDto,
    usuarioId: string,
  ): Promise<CardComentario> {
    const comentario = await this.buscarDoCard(cardId, comentarioId);
    this.verificarDono(comentario, usuarioId);

    const textoAntigo = comentario.texto;
    await this.dataSource.transaction(async (manager) => {
      comentario.texto = dto.texto;
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

  private async buscarComUsuario(id: string): Promise<CardComentario> {
    const comentario = await this.dataSource.manager.findOne(CardComentario, {
      where: { id },
      relations: { usuario: true },
    });
    if (!comentario) {
      throw new NotFoundException('Comentário não encontrado');
    }
    return comentario;
  }
}
