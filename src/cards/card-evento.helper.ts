import { EntityManager } from 'typeorm';
import { CardEvento } from './entities/card-evento.entity';
import { CardEventoTipo } from './enums/card-evento-tipo.enum';

// Quem/como um evento aconteceu. usuarioId null cobre dois casos bem
// diferentes: efeito em cascata de automação (automatico: true) e submissão
// de formulário externo público sem login (automatico: false) — os dois
// ficam sem autor identificável, mas só o primeiro é "sistema".
export interface AtorEvento {
  usuarioId: string | null;
  automatico: boolean;
}

// Usado em todo ponto de executarAcao (automacoes.service.ts): qualquer
// efeito colateral de uma automação em cascata é sempre atribuído a
// "ninguém"/automático, mesmo que a automação tenha sido disparada por uma
// ação direta de um usuário identificado — decisão deliberada (ver
// conversa): o rastro de causa fica só no evento direto que iniciou a
// cadeia, não se propaga fingindo autoria humana nos efeitos indiretos.
export const ATOR_AUTOMATICO: AtorEvento = {
  usuarioId: null,
  automatico: true,
};

export interface RegistrarEventoCardParams {
  cardId: string;
  tipo: CardEventoTipo;
  ator: AtorEvento;
  dadosAntes?: Record<string, unknown> | null;
  dadosDepois?: Record<string, unknown> | null;
}

export async function registrarEventoCard(
  manager: EntityManager,
  params: RegistrarEventoCardParams,
): Promise<void> {
  await manager.save(
    manager.create(CardEvento, {
      cardId: params.cardId,
      tipo: params.tipo,
      usuarioId: params.ator.usuarioId,
      automatico: params.ator.automatico,
      dadosAntes: params.dadosAntes ?? null,
      dadosDepois: params.dadosDepois ?? null,
    }),
  );
}
