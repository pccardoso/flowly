import {
  NotificacaoFormato,
  NotificacaoTamanho,
  NotificacaoTipo,
} from './enums/notificacao.enum';

// Acumulado por um step NOTIFICACAO durante a execução (ver
// ContextoExecucaoStep.notificacoesEnfileiradas, em step-executor.interface.ts)
// e emitido via WebSocket só depois que a transação comitar — mesma regra de
// cardsCriados/cardsAtualizados/emailsEnfileirados: nunca notificar durante uma
// transação que ainda pode sofrer rollback por um erro mais adiante na mesma
// cadeia de automação/integração.
export interface NotificacaoEnfileirada {
  processoId: string;
  cardId: string;
  tipo: NotificacaoTipo;
  tamanho: NotificacaoTamanho;
  formato: NotificacaoFormato;
  // Já sanitizado (ver src/common/html-sanitize.util.ts) quando formato =
  // HTML; texto puro sem nenhuma transformação quando formato = TEXTO.
  conteudo: string;
  // id de um som do catálogo fixo (ver src/sons/sons.catalogo.ts) que o front
  // toca quando o alerta aparece; null = sem som.
  som: string | null;
}
