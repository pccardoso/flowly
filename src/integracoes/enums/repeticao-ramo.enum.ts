// Ids fixos de ramoOrigem (ver IntegracaoConexao) usados pelas conexões que
// saem de um step REPETICAO — mesmo mecanismo de ramoOrigem que CONDICAO já
// usa, só que aqui os dois ramos são sempre os mesmos dois, não configuráveis
// pelo usuário (diferente de CONDICAO, onde os ramos vêm de config.ramos).
//
// ENQUANTO: liga ao "corpo" — tudo alcançável a partir daqui é reexecutado
// uma vez por iteração (ver IntegracoesService.executarSequencia).
// FINALIZADO: liga ao que deve rodar uma única vez, depois que todas as
// iterações do ENQUANTO já terminaram — continua a sequência normalmente,
// exatamente como um ramo comum de CONDICAO.
export const RAMO_REPETICAO_ENQUANTO = 'ENQUANTO';
export const RAMO_REPETICAO_FINALIZADO = 'FINALIZADO';
