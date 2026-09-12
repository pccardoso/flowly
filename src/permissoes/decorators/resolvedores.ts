import { Card } from '../../cards/entities/card.entity';
import { ResolvedorProcessoId } from './requer-permissao.decorator';

// Resolvedores prontos pra usar com @RequerPermissao. A maioria das rotas
// já tem o processoId direto na URL (processos aninhados: fases, transições,
// conexões, automações) — só CardsController não é aninhado sob /processos,
// então suas rotas por :id (cardId) precisam de uma consulta ao banco.

export const porParametro = (nome: string): ResolvedorProcessoId => (req) =>
  req.params[nome] as string | undefined;

export const porQuery = (nome: string): ResolvedorProcessoId => (req) =>
  req.query[nome] as string | undefined;

export const porBody = (campo: string): ResolvedorProcessoId => (req) =>
  (req.body as Record<string, unknown> | undefined)?.[campo] as
    | string
    | undefined;

export const porCard = (paramCardId = 'id'): ResolvedorProcessoId => async (
  req,
  dataSource,
) => {
  const cardId = req.params[paramCardId] as string | undefined;
  if (!cardId) {
    return undefined;
  }
  const card = await dataSource.manager.findOne(Card, {
    where: { id: cardId },
    select: { processoId: true },
  });
  return card?.processoId;
};
