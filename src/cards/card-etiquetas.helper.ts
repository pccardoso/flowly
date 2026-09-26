import { EntityManager, In } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { Card } from './entities/card.entity';
import { CardEtiqueta } from './entities/card-etiqueta.entity';
import { Etiqueta } from '../etiquetas/entities/etiqueta.entity';
import {
  EtiquetaResumo,
  paraEtiquetaResumo,
} from '../etiquetas/etiqueta.types';
import { AtorEvento, registrarEventoCard } from './card-evento.helper';
import { CardEventoTipo } from './enums/card-evento-tipo.enum';

export interface ResultadoDefinirEtiquetas {
  adicionadas: string[];
  removidas: string[];
  etiquetas: EtiquetaResumo[];
}

// Etiquetas atuais do card, na ordem em que foram aplicadas (nome desempata
// as aplicadas no mesmo instante, ex.: várias de uma vez).
export async function listarEtiquetasDoCard(
  manager: EntityManager,
  cardId: string,
): Promise<EtiquetaResumo[]> {
  const vinculos = await manager.find(CardEtiqueta, {
    where: { cardId },
    relations: { etiqueta: true },
  });
  vinculos.sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.etiqueta.nome.localeCompare(b.etiqueta.nome),
  );
  return vinculos.map((v) => paraEtiquetaResumo(v.etiqueta));
}

// Leva o card ao conjunto EXATO `etiquetaIdsFinais`: insere só o que falta,
// remove só o que sobra — quem já tem a etiqueta não é tocado. Nada mudou =
// nenhuma escrita e nenhum evento de histórico. Todas as etiquetas precisam
// ser do processo do card. Sempre roda no `manager` recebido (transação da
// chamada/cadeia de automação).
export async function definirEtiquetasDoCard(
  manager: EntityManager,
  card: Card,
  etiquetaIdsFinais: string[],
  ator: AtorEvento,
): Promise<ResultadoDefinirEtiquetas> {
  const idsFinais = Array.from(new Set(etiquetaIdsFinais));

  const etiquetasFinais = idsFinais.length
    ? await manager.find(Etiqueta, {
        where: { id: In(idsFinais), processoId: card.processoId },
      })
    : [];
  if (etiquetasFinais.length !== idsFinais.length) {
    const encontradas = new Set(etiquetasFinais.map((e) => e.id));
    const faltando = idsFinais.filter((id) => !encontradas.has(id));
    throw new NotFoundException(
      `Etiqueta(s) não encontrada(s) neste processo: ${faltando.join(', ')}`,
    );
  }

  const antes = await listarEtiquetasDoCard(manager, card.id);
  const idsAntes = new Set(antes.map((e) => e.id));
  const setFinais = new Set(idsFinais);

  const adicionadas = idsFinais.filter((id) => !idsAntes.has(id));
  const removidas = antes.filter((e) => !setFinais.has(e.id)).map((e) => e.id);

  if (removidas.length > 0) {
    await manager.delete(CardEtiqueta, {
      cardId: card.id,
      etiquetaId: In(removidas),
    });
  }
  if (adicionadas.length > 0) {
    await manager.save(
      adicionadas.map((etiquetaId) =>
        manager.create(CardEtiqueta, { cardId: card.id, etiquetaId }),
      ),
    );
  }

  if (adicionadas.length === 0 && removidas.length === 0) {
    return { adicionadas, removidas, etiquetas: antes };
  }

  const depois = await listarEtiquetasDoCard(manager, card.id);
  await registrarEventoCard(manager, {
    cardId: card.id,
    tipo: CardEventoTipo.ETIQUETAS_ATUALIZADAS,
    ator,
    dadosAntes: { etiquetas: antes },
    dadosDepois: { etiquetas: depois },
  });
  return { adicionadas, removidas, etiquetas: depois };
}
