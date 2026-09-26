import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Card } from './entities/card.entity';
import {
  definirEtiquetasDoCard,
  listarEtiquetasDoCard,
} from './card-etiquetas.helper';
import { AtorEvento } from './card-evento.helper';
import { EtiquetaResumo } from '../etiquetas/etiqueta.types';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class CardEtiquetasService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  private async buscarCard(
    manager: EntityManager,
    cardId: string,
  ): Promise<Card> {
    const card = await manager.findOne(Card, { where: { id: cardId } });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }
    return card;
  }

  async listar(cardId: string): Promise<EtiquetaResumo[]> {
    await this.buscarCard(this.dataSource.manager, cardId);
    return listarEtiquetasDoCard(this.dataSource.manager, cardId);
  }

  // Substitui a lista inteira (array vazio remove todas).
  async atualizar(
    cardId: string,
    etiquetaIds: string[],
    ator: AtorEvento,
  ): Promise<EtiquetaResumo[]> {
    return this.mutar(cardId, ator, () => etiquetaIds);
  }

  // Idempotente: se o card já tem a etiqueta, não faz nada.
  async adicionar(
    cardId: string,
    etiquetaId: string,
    ator: AtorEvento,
  ): Promise<EtiquetaResumo[]> {
    return this.mutar(cardId, ator, (atuais) => [...atuais, etiquetaId]);
  }

  // Idempotente: se o card não tem a etiqueta, não faz nada.
  async remover(
    cardId: string,
    etiquetaId: string,
    ator: AtorEvento,
  ): Promise<EtiquetaResumo[]> {
    return this.mutar(cardId, ator, (atuais) =>
      atuais.filter((id) => id !== etiquetaId),
    );
  }

  private async mutar(
    cardId: string,
    ator: AtorEvento,
    calcularIdsFinais: (idsAtuais: string[]) => string[],
  ): Promise<EtiquetaResumo[]> {
    const { card, resultado } = await this.dataSource.transaction(
      async (manager) => {
        const card = await this.buscarCard(manager, cardId);
        const atuais = await listarEtiquetasDoCard(manager, cardId);
        const resultado = await definirEtiquetasDoCard(
          manager,
          card,
          calcularIdsFinais(atuais.map((e) => e.id)),
          ator,
        );
        return { card, resultado };
      },
    );

    if (resultado.adicionadas.length > 0 || resultado.removidas.length > 0) {
      card.etiquetas = resultado.etiquetas;
      this.realtimeGateway.emitirCardAtualizado(card.processoId, card);
    }
    return resultado.etiquetas;
  }
}
