// Tipo de cada linha do histórico do card (ver CardEvento). O formato de
// `dadosAntes`/`dadosDepois` varia por tipo — ver card-evento.helper.ts.
export enum CardEventoTipo {
  CARD_CRIADO = 'CARD_CRIADO',
  CARD_MOVIDO = 'CARD_MOVIDO',
  CAMPO_ATUALIZADO = 'CAMPO_ATUALIZADO',
  TITULO_ATUALIZADO = 'TITULO_ATUALIZADO',
  ANEXO_ADICIONADO = 'ANEXO_ADICIONADO',
  ANEXO_REMOVIDO = 'ANEXO_REMOVIDO',
  COMENTARIO_CRIADO = 'COMENTARIO_CRIADO',
  COMENTARIO_EDITADO = 'COMENTARIO_EDITADO',
  COMENTARIO_REMOVIDO = 'COMENTARIO_REMOVIDO',
}
