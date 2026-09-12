// Novas ações entram aqui como um novo valor + um case em
// AutomacoesService.validarAcao / executarAcao.
export enum AcaoTipo {
  ATUALIZAR_CAMPO = 'ATUALIZAR_CAMPO',
  ATUALIZAR_TITULO = 'ATUALIZAR_TITULO',
  CRIAR_CARD_FILHO = 'CRIAR_CARD_FILHO',
  MOVER_CARD_PAI = 'MOVER_CARD_PAI',
  MOVER_CARD_FILHO = 'MOVER_CARD_FILHO',
  MOVER_CARD_ATUAL = 'MOVER_CARD_ATUAL',
}
