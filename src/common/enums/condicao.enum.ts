// Tipos de dado e operadores compartilhados por todo motor que precisa
// comparar um valor dinâmico contra uma regra configurada pelo usuário — hoje
// usado pelo step CONDICAO (src/integracoes) e pelos filtros de
// RelatorioModelo (src/relatorios). Ver condicao.util.ts (nesta mesma pasta)
// pra onde isso é de fato avaliado.
export enum CondicaoTipoDado {
  INTEIRO = 'INTEIRO',
  BOOLEAN = 'BOOLEAN',
  STRING = 'STRING',
  DATA = 'DATA',
}

export enum CondicaoOperador {
  IGUAL = 'IGUAL',
  DIFERENTE = 'DIFERENTE',
  MAIOR = 'MAIOR',
  MAIOR_OU_IGUAL = 'MAIOR_OU_IGUAL',
  MENOR = 'MENOR',
  MENOR_OU_IGUAL = 'MENOR_OU_IGUAL',
  ENTRE = 'ENTRE',
  CONTEM = 'CONTEM',
  NAO_CONTEM = 'NAO_CONTEM',
  COMECA_COM = 'COMECA_COM',
  TERMINA_COM = 'TERMINA_COM',
  VAZIO = 'VAZIO',
  PREENCHIDO = 'PREENCHIDO',
}

// Ramo padrão implícito de todo step CONDICAO (src/integracoes) — cobre o
// caso de nenhuma regra de config.ramos bater. Não se aplica a
// RelatorioModelo.filtros (que não tem conceito de ramo/roteamento, só
// filtra sim/não).
export const RAMO_CONDICAO_SENAO = 'senao';

export const OPERADORES_POR_TIPO_DADO: Record<
  CondicaoTipoDado,
  CondicaoOperador[]
> = {
  [CondicaoTipoDado.INTEIRO]: [
    CondicaoOperador.IGUAL,
    CondicaoOperador.DIFERENTE,
    CondicaoOperador.MAIOR,
    CondicaoOperador.MAIOR_OU_IGUAL,
    CondicaoOperador.MENOR,
    CondicaoOperador.MENOR_OU_IGUAL,
    CondicaoOperador.ENTRE,
    CondicaoOperador.VAZIO,
    CondicaoOperador.PREENCHIDO,
  ],
  [CondicaoTipoDado.BOOLEAN]: [
    CondicaoOperador.IGUAL,
    CondicaoOperador.VAZIO,
    CondicaoOperador.PREENCHIDO,
  ],
  [CondicaoTipoDado.STRING]: [
    CondicaoOperador.IGUAL,
    CondicaoOperador.DIFERENTE,
    CondicaoOperador.CONTEM,
    CondicaoOperador.NAO_CONTEM,
    CondicaoOperador.COMECA_COM,
    CondicaoOperador.TERMINA_COM,
    CondicaoOperador.VAZIO,
    CondicaoOperador.PREENCHIDO,
  ],
  [CondicaoTipoDado.DATA]: [
    CondicaoOperador.IGUAL,
    CondicaoOperador.MAIOR,
    CondicaoOperador.MAIOR_OU_IGUAL,
    CondicaoOperador.MENOR,
    CondicaoOperador.MENOR_OU_IGUAL,
    CondicaoOperador.ENTRE,
    CondicaoOperador.VAZIO,
    CondicaoOperador.PREENCHIDO,
  ],
};

// VAZIO/PREENCHIDO não comparam contra nada — os outros operadores exigem
// "valor" na regra, e ENTRE exige "valorFinal" além de "valor".
export const OPERADORES_SEM_VALOR = new Set<CondicaoOperador>([
  CondicaoOperador.VAZIO,
  CondicaoOperador.PREENCHIDO,
]);

export const OPERADORES_COM_VALOR_FINAL = new Set<CondicaoOperador>([
  CondicaoOperador.ENTRE,
]);
