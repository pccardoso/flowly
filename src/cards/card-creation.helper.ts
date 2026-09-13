import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { FaseTransicao } from '../fases/entities/fase-transicao.entity';
import { Card } from './entities/card.entity';
import { CardMovimentacao } from './entities/card-movimentacao.entity';
import { CardEventoTipo } from './enums/card-evento-tipo.enum';
import { AtorEvento, registrarEventoCard } from './card-evento.helper';
import type { AutomacoesService } from '../automacoes/automacoes.service';

export interface CriarCardEmFaseParams {
  processoId: string;
  // Opcional se o processo tiver `tituloCampoId` configurado e o valor
  // correspondente vier em `campos` — nesse caso o título é derivado.
  titulo?: string;
  campos?: Record<string, unknown>;
}

// Deriva o título quando não veio explícito: usa `campos[tituloCampoId]`
// se o processo tiver essa configuração e o campo vier preenchido.
function resolverTitulo(
  tituloInformado: string | undefined,
  processo: Processo,
  campos: Record<string, unknown> | undefined,
): string {
  const tituloLimpo = tituloInformado?.trim();
  if (tituloLimpo) {
    return tituloLimpo;
  }

  const valorCampo = processo.tituloCampoId
    ? campos?.[processo.tituloCampoId]
    : undefined;
  if (valorCampo !== undefined && valorCampo !== null) {
    const valorTexto = String(valorCampo).trim();
    if (valorTexto) {
      return valorTexto;
    }
  }

  throw new BadRequestException(
    processo.tituloCampoId
      ? `titulo é obrigatório (ou envie campos.${processo.tituloCampoId} preenchido)`
      : 'titulo é obrigatório',
  );
}

// Fluxo de criação de card (card + movimentação inicial + disparo do
// gatilho CARD_ENTROU_NA_FASE), compartilhado entre CardsService.criar
// (criação manual) e AutomacoesService (ação CRIAR_CARD_FILHO). Extraído
// para evitar dependência circular entre os dois services/módulos.
//
// `cardsCriados`, se informado, recebe cada card criado (inclusive os
// gerados em cascata por automações disparadas durante a própria criação).
// `cardsAtualizados`, se informado, recebe (deduplicado por id) todo card já
// EXISTENTE que uma automação em cascata alterou (campo, título, movimento).
// Quem chama usa essas coleções pra notificar via WebSocket (`card:criado` /
// `card:atualizado`) só depois que a transação inteira for commitada — nunca
// durante ela, pra não anunciar algo que pode ser desfeito por um erro mais
// adiante na mesma transação.
export async function criarCardEmFase(
  manager: EntityManager,
  automacoesService: AutomacoesService,
  params: CriarCardEmFaseParams,
  ator: AtorEvento,
  cardsCriados?: Card[],
  profundidade = 0,
  cardsAtualizados?: Map<string, Card>,
): Promise<Card> {
  const processo = await manager.findOne(Processo, {
    where: { id: params.processoId },
  });
  if (!processo) {
    throw new NotFoundException('Processo não encontrado');
  }

  // A fase inicial é sempre a de menor `ordem` do processo — não dá pra
  // escolher outra na criação (mantém o contrato do card simples).
  const faseInicial = await manager.findOne(Fase, {
    where: { processoId: params.processoId },
    order: { ordem: 'ASC' },
  });
  if (!faseInicial) {
    throw new UnprocessableEntityException(
      'Processo não possui fases configuradas',
    );
  }

  const titulo = resolverTitulo(params.titulo, processo, params.campos);

  const card = await manager.save(
    manager.create(Card, {
      titulo,
      processoId: processo.id,
      faseAtualId: faseInicial.id,
      campos: params.campos ?? {},
    }),
  );
  cardsCriados?.push(card);

  await manager.save(
    manager.create(CardMovimentacao, {
      cardId: card.id,
      faseOrigemId: null,
      faseDestinoId: faseInicial.id,
    }),
  );

  await registrarEventoCard(manager, {
    cardId: card.id,
    tipo: CardEventoTipo.CARD_CRIADO,
    ator,
    dadosDepois: { titulo: card.titulo, faseId: faseInicial.id },
  });

  await automacoesService.executarGatilhoCardEntrouNaFase(
    manager,
    card,
    faseInicial.id,
    cardsCriados,
    profundidade,
    cardsAtualizados,
  );

  return card;
}

// Move um card já existente pra outra fase do MESMO processo dele,
// validando a transição no grafo (FaseTransicao) e disparando o gatilho de
// entrada na nova fase. Compartilhado entre CardsService.mover (movimentação
// manual) e AutomacoesService (ações MOVER_CARD_PAI/MOVER_CARD_FILHO) — por
// isso lança exatamente o mesmo erro nos dois casos quando a transição não
// está configurada, derrubando a transação inteira (ver `cardsCriados` em
// `criarCardEmFase` para a mesma lógica de notificação pós-commit).
export async function moverCardParaFase(
  manager: EntityManager,
  automacoesService: AutomacoesService,
  card: Card,
  faseDestinoId: string,
  ator: AtorEvento,
  cardsCriados?: Card[],
  profundidade = 0,
  cardsAtualizados?: Map<string, Card>,
): Promise<CardMovimentacao> {
  if (card.faseAtualId === faseDestinoId) {
    throw new UnprocessableEntityException('Card já está nessa fase');
  }

  const faseDestino = await manager.findOne(Fase, {
    where: { id: faseDestinoId, processoId: card.processoId },
  });
  if (!faseDestino) {
    throw new NotFoundException(
      'Fase de destino não encontrada neste processo',
    );
  }

  const transicaoPermitida = await manager.findOne(FaseTransicao, {
    where: { faseOrigemId: card.faseAtualId, faseDestinoId },
  });
  if (!transicaoPermitida) {
    throw new UnprocessableEntityException(
      'Movimento não permitido entre essas fases',
    );
  }

  const faseOrigemId = card.faseAtualId;
  const faseOrigem = await manager.findOne(Fase, {
    where: { id: faseOrigemId },
  });
  card.faseAtualId = faseDestinoId;
  await manager.save(card);
  cardsAtualizados?.set(card.id, card);

  const movimentacao = await manager.save(
    manager.create(CardMovimentacao, {
      cardId: card.id,
      faseOrigemId,
      faseDestinoId,
    }),
  );

  await registrarEventoCard(manager, {
    cardId: card.id,
    tipo: CardEventoTipo.CARD_MOVIDO,
    ator,
    dadosAntes: { faseId: faseOrigemId, faseNome: faseOrigem?.nome ?? null },
    dadosDepois: { faseId: faseDestinoId, faseNome: faseDestino.nome },
  });

  await automacoesService.executarGatilhoCardEntrouNaFase(
    manager,
    card,
    faseDestinoId,
    cardsCriados,
    profundidade,
    cardsAtualizados,
  );

  return movimentacao;
}
