// Qual formulário do processo define o conjunto de campos que o step
// ACAO_ATUALIZAR_CAMPOS_LOTE está preenchendo — ENTRADA (Processo.
// formularioEntrada) ou FASE (Fase.formularioFase). Usado só como metadado
// documentacional (aparece no catálogo de steps pro front); a execução em si
// não distingue os dois, grava `valores` do mesmo jeito nos dois casos.
export enum TipoFormularioAlvo {
  ENTRADA = 'ENTRADA',
  FASE = 'FASE',
}
