// Status de uma emissão de PDF de card (ver CardPdfEmissao). Nasce
// PROCESSANDO (renderização roda em background, ver CardPdfEmissaoProcessor)
// e termina em CONCLUIDO (objectKey preenchido) ou ERRO (erroMensagem
// preenchida) — nunca volta pra PROCESSANDO.
export enum CardPdfEmissaoStatus {
  PROCESSANDO = 'PROCESSANDO',
  CONCLUIDO = 'CONCLUIDO',
  ERRO = 'ERRO',
}
