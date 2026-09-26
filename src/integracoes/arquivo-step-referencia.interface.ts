// Referência a um arquivo-modelo já enviado pra staging (ver
// IntegracoesService.uploadArquivoStep / POST .../integracoes/arquivos-step)
// — é o formato de cada item de config.arquivos do step ACAO_ANEXAR_ARQUIVO.
// `objectKey` aponta pro arquivo original em staging; cada execução do step
// copia esse objeto pra um novo, exclusivo do card+execução (ver
// StorageService.copiar).
export interface ArquivoStepReferencia {
  objectKey: string;
  nomeOriginal: string;
  mimeType: string;
  tamanho: number;
}
