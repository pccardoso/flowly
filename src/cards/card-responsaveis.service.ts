import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Card } from './entities/card.entity';
import { CardResponsavel } from './entities/card-responsavel.entity';
import { User } from '../users/entities/user.entity';
import { registrarEventoCard, AtorEvento } from './card-evento.helper';
import { CardEventoTipo } from './enums/card-evento-tipo.enum';

export interface ResponsavelResposta {
  usuarioId: string;
  nome: string;
  email: string;
  avatarUrl: string | null;
  atribuidoEm: Date;
}

@Injectable()
export class CardResponsaveisService {
  constructor(private readonly dataSource: DataSource) {}

  private paraResposta(vinculo: CardResponsavel): ResponsavelResposta {
    return {
      usuarioId: vinculo.usuarioId,
      nome: vinculo.usuario.nome,
      email: vinculo.usuario.email,
      avatarUrl: vinculo.usuario.avatarObjectKey
        ? `/usuarios/${vinculo.usuarioId}/avatar`
        : null,
      atribuidoEm: vinculo.createdAt,
    };
  }

  async listar(cardId: string): Promise<ResponsavelResposta[]> {
    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: cardId },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    const vinculos = await this.dataSource.manager.find(CardResponsavel, {
      where: { cardId },
      relations: { usuario: true },
      order: { createdAt: 'ASC' },
    });
    return vinculos.map((vinculo) => this.paraResposta(vinculo));
  }

  // Substitui a lista inteira (PUT) — sem checagem de "quem pode ser
  // responsável de quem" por enquanto (ver conversa/CardResponsavel):
  // qualquer usuário existente pode ser atribuído, mesma trava de card.editar
  // de qualquer outra mutação de card.
  async atualizar(
    cardId: string,
    usuarioIds: string[],
    ator: AtorEvento,
  ): Promise<ResponsavelResposta[]> {
    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: cardId },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    if (usuarioIds.length > 0) {
      const usuariosExistentes = await this.dataSource.manager.find(User, {
        where: { id: In(usuarioIds) },
        select: { id: true },
      });
      const idsExistentes = new Set(usuariosExistentes.map((u) => u.id));
      const idsInexistentes = usuarioIds.filter((id) => !idsExistentes.has(id));
      if (idsInexistentes.length > 0) {
        throw new NotFoundException(
          `Usuário(s) não encontrado(s): ${idsInexistentes.join(', ')}`,
        );
      }
    }

    const vinculos = await this.dataSource.transaction(async (manager) => {
      const antes = await manager.find(CardResponsavel, { where: { cardId } });

      await manager.delete(CardResponsavel, { cardId });
      if (usuarioIds.length > 0) {
        await manager.save(
          usuarioIds.map((usuarioId) =>
            manager.create(CardResponsavel, { cardId, usuarioId }),
          ),
        );
      }

      await registrarEventoCard(manager, {
        cardId,
        tipo: CardEventoTipo.RESPONSAVEIS_ATUALIZADOS,
        ator,
        dadosAntes: { usuarioIds: antes.map((v) => v.usuarioId) },
        dadosDepois: { usuarioIds },
      });

      return manager.find(CardResponsavel, {
        where: { cardId },
        relations: { usuario: true },
        order: { createdAt: 'ASC' },
      });
    });

    return vinculos.map((vinculo) => this.paraResposta(vinculo));
  }
}
