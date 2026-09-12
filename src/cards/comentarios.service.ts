import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Card } from './entities/card.entity';
import { CardComentario } from './entities/card-comentario.entity';
import { User } from '../users/entities/user.entity';
import { CreateComentarioDto } from './dto/create-comentario.dto';
import { RemoverComentarioDto } from './dto/remover-comentario.dto';

@Injectable()
export class ComentariosService {
  constructor(private readonly dataSource: DataSource) {}

  async criar(
    cardId: string,
    dto: CreateComentarioDto,
  ): Promise<CardComentario> {
    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: cardId },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    const usuario = await this.dataSource.manager.findOne(User, {
      where: { id: dto.usuarioId },
    });
    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const comentario = this.dataSource.manager.create(CardComentario, {
      cardId,
      usuarioId: dto.usuarioId,
      texto: dto.texto,
    });
    await this.dataSource.manager.save(comentario);
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
  ): Promise<CardComentario> {
    const comentario = await this.buscarDoCard(cardId, comentarioId);
    this.verificarDono(comentario, dto.usuarioId);

    comentario.texto = dto.texto;
    await this.dataSource.manager.save(comentario);
    return this.buscarComUsuario(comentario.id);
  }

  async remover(
    cardId: string,
    comentarioId: string,
    dto: RemoverComentarioDto,
  ): Promise<void> {
    const comentario = await this.buscarDoCard(cardId, comentarioId);
    this.verificarDono(comentario, dto.usuarioId);

    await this.dataSource.manager.delete(CardComentario, comentario.id);
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
