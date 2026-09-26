import { AtorEvento } from '../cards/card-evento.helper';

export const FILA_GATILHO_EXECUCAO = 'gatilho-execucao';

// Um job por evento de nível raiz (nunca por encadeamento — ver
// card-creation.helper.ts). CARD_CRIADO carrega faseId porque
// criarCardEmFase dispara os dois gatilhos (GATILHO_CARD_CRIADO e
// GATILHO_CARD_ENTROU_NA_FASE na fase inicial) como uma cadeia só, e o
// processor precisa repetir exatamente essa dupla dentro da MESMA transação
// pra preservar a semântica de hoje (ou os dois efeitos comitam juntos, ou
// nenhum comita).
export type GatilhoExecucaoJobPayload =
  | { tipo: 'CARD_CRIADO'; cardId: string; ator: AtorEvento; faseId: string }
  | { tipo: 'CARD_ENTROU_NA_FASE'; cardId: string; faseId: string }
  | { tipo: 'CAMPO_ATUALIZADO'; cardId: string; camposAlterados: string[] }
  // Vencimento: `dataVencimento` (ISO) é a data que motivou o disparo — o
  // processor descarta o job se o card mudou de data desde então.
  | { tipo: 'CARD_VENCIDO'; cardId: string; dataVencimento: string }
  | { tipo: 'CARD_PRESTES_A_VENCER'; cardId: string; dataVencimento: string };
