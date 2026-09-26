// Metadados puramente visuais do step NOTIFICACAO (ver step-executors.ts) —
// nenhum efeito no motor de execução, só instruem o front sobre estilo/ícone
// e formato de renderização do alerta.
export enum NotificacaoTipo {
  ALERTA = 'ALERTA',
  INFO = 'INFO',
  SUCESSO = 'SUCESSO',
  PERIGO = 'PERIGO',
}

export enum NotificacaoTamanho {
  P = 'P',
  M = 'M',
  G = 'G',
}

// TEXTO: front renderiza como texto puro (nunca inserir via innerHTML).
// HTML: backend sanitiza (ver src/common/html-sanitize.util.ts) antes de
// emitir — só assim é seguro o front inserir via innerHTML/dangerouslySetInnerHTML.
export enum NotificacaoFormato {
  TEXTO = 'TEXTO',
  HTML = 'HTML',
}
