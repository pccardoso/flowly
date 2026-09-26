export enum StatusExecucao {
  SUCESSO = 'SUCESSO',
  ERRO = 'ERRO',
  // Só usado por IntegracaoExecucaoStep: step downstream de um CONDICAO cujo
  // ramo não foi o escolhido (ver executarGrafo em integracoes.service.ts).
  // AutomacaoExecucao nunca usa este valor.
  PULADO = 'PULADO',
}
