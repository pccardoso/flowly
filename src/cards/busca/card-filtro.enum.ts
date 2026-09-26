// Tipos de atributo filtráveis num card (busca inteligente do kanban/lista).
// Não reaproveita CondicaoTipoDado (src/common/enums/condicao.enum.ts) porque
// aquele enum alimenta o step CONDICAO das integrações, e aqui precisamos de
// tipos que ele não tem (seleção, múltipla escolha, fase, usuário, etiqueta,
// vencimento) e de operadores de conjunto.
export enum FiltroTipo {
  TEXTO = 'TEXTO',
  NUMERO = 'NUMERO',
  DATA = 'DATA',
  BOOLEANO = 'BOOLEANO',
  SELECAO = 'SELECAO',
  MULTIPLA_ESCOLHA = 'MULTIPLA_ESCOLHA',
  FASE = 'FASE',
  USUARIO = 'USUARIO',
  ETIQUETA = 'ETIQUETA',
  VENCIMENTO = 'VENCIMENTO',
}

export enum FiltroOperador {
  IGUAL = 'IGUAL',
  DIFERENTE = 'DIFERENTE',
  CONTEM = 'CONTEM',
  NAO_CONTEM = 'NAO_CONTEM',
  COMECA_COM = 'COMECA_COM',
  TERMINA_COM = 'TERMINA_COM',
  MAIOR = 'MAIOR',
  MAIOR_OU_IGUAL = 'MAIOR_OU_IGUAL',
  MENOR = 'MENOR',
  MENOR_OU_IGUAL = 'MENOR_OU_IGUAL',
  ENTRE = 'ENTRE',
  VAZIO = 'VAZIO',
  PREENCHIDO = 'PREENCHIDO',
  // "é um de" / "não é nenhum de" — atributo de valor único contra uma lista.
  EM = 'EM',
  NAO_EM = 'NAO_EM',
  // Atributo de vários valores (checkbox com opções, responsáveis,
  // etiquetas) contra uma lista.
  CONTEM_ALGUM = 'CONTEM_ALGUM',
  CONTEM_TODOS = 'CONTEM_TODOS',
  NAO_CONTEM_NENHUM = 'NAO_CONTEM_NENHUM',
}

// Como o front deve montar o input do valor:
//  NENHUM    → sem input (VAZIO/PREENCHIDO)
//  UNICO     → um input do tipo do campo → `valor`
//  INTERVALO → dois inputs → `valor` (início) e `valorFinal` (fim)
//  LISTA     → multisseleção sobre `opcoes` → `valor` como array
export enum FiltroEntrada {
  NENHUM = 'NENHUM',
  UNICO = 'UNICO',
  INTERVALO = 'INTERVALO',
  LISTA = 'LISTA',
}

export const OPERADORES_POR_TIPO_FILTRO: Record<FiltroTipo, FiltroOperador[]> =
  {
    [FiltroTipo.TEXTO]: [
      FiltroOperador.CONTEM,
      FiltroOperador.NAO_CONTEM,
      FiltroOperador.IGUAL,
      FiltroOperador.DIFERENTE,
      FiltroOperador.COMECA_COM,
      FiltroOperador.TERMINA_COM,
      FiltroOperador.VAZIO,
      FiltroOperador.PREENCHIDO,
    ],
    [FiltroTipo.NUMERO]: [
      FiltroOperador.IGUAL,
      FiltroOperador.DIFERENTE,
      FiltroOperador.MAIOR,
      FiltroOperador.MAIOR_OU_IGUAL,
      FiltroOperador.MENOR,
      FiltroOperador.MENOR_OU_IGUAL,
      FiltroOperador.ENTRE,
      FiltroOperador.VAZIO,
      FiltroOperador.PREENCHIDO,
    ],
    [FiltroTipo.DATA]: [
      FiltroOperador.IGUAL,
      FiltroOperador.MAIOR,
      FiltroOperador.MAIOR_OU_IGUAL,
      FiltroOperador.MENOR,
      FiltroOperador.MENOR_OU_IGUAL,
      FiltroOperador.ENTRE,
      FiltroOperador.VAZIO,
      FiltroOperador.PREENCHIDO,
    ],
    [FiltroTipo.BOOLEANO]: [FiltroOperador.IGUAL],
    [FiltroTipo.SELECAO]: [
      FiltroOperador.EM,
      FiltroOperador.NAO_EM,
      FiltroOperador.VAZIO,
      FiltroOperador.PREENCHIDO,
    ],
    [FiltroTipo.MULTIPLA_ESCOLHA]: [
      FiltroOperador.CONTEM_ALGUM,
      FiltroOperador.CONTEM_TODOS,
      FiltroOperador.NAO_CONTEM_NENHUM,
      FiltroOperador.VAZIO,
      FiltroOperador.PREENCHIDO,
    ],
    [FiltroTipo.FASE]: [FiltroOperador.EM, FiltroOperador.NAO_EM],
    [FiltroTipo.USUARIO]: [
      FiltroOperador.CONTEM_ALGUM,
      FiltroOperador.CONTEM_TODOS,
      FiltroOperador.NAO_CONTEM_NENHUM,
      FiltroOperador.VAZIO,
      FiltroOperador.PREENCHIDO,
    ],
    [FiltroTipo.ETIQUETA]: [
      FiltroOperador.CONTEM_ALGUM,
      FiltroOperador.CONTEM_TODOS,
      FiltroOperador.NAO_CONTEM_NENHUM,
      FiltroOperador.VAZIO,
      FiltroOperador.PREENCHIDO,
    ],
    [FiltroTipo.VENCIMENTO]: [FiltroOperador.EM, FiltroOperador.NAO_EM],
  };

export function entradaDoOperador(operador: FiltroOperador): FiltroEntrada {
  switch (operador) {
    case FiltroOperador.VAZIO:
    case FiltroOperador.PREENCHIDO:
      return FiltroEntrada.NENHUM;
    case FiltroOperador.ENTRE:
      return FiltroEntrada.INTERVALO;
    case FiltroOperador.EM:
    case FiltroOperador.NAO_EM:
    case FiltroOperador.CONTEM_ALGUM:
    case FiltroOperador.CONTEM_TODOS:
    case FiltroOperador.NAO_CONTEM_NENHUM:
      return FiltroEntrada.LISTA;
    default:
      return FiltroEntrada.UNICO;
  }
}

const ROTULOS_PADRAO: Record<FiltroOperador, string> = {
  [FiltroOperador.IGUAL]: 'Igual a',
  [FiltroOperador.DIFERENTE]: 'Diferente de',
  [FiltroOperador.CONTEM]: 'Contém',
  [FiltroOperador.NAO_CONTEM]: 'Não contém',
  [FiltroOperador.COMECA_COM]: 'Começa com',
  [FiltroOperador.TERMINA_COM]: 'Termina com',
  [FiltroOperador.MAIOR]: 'Maior que',
  [FiltroOperador.MAIOR_OU_IGUAL]: 'Maior ou igual a',
  [FiltroOperador.MENOR]: 'Menor que',
  [FiltroOperador.MENOR_OU_IGUAL]: 'Menor ou igual a',
  [FiltroOperador.ENTRE]: 'Entre',
  [FiltroOperador.VAZIO]: 'Está vazio',
  [FiltroOperador.PREENCHIDO]: 'Está preenchido',
  [FiltroOperador.EM]: 'É um de',
  [FiltroOperador.NAO_EM]: 'Não é nenhum de',
  [FiltroOperador.CONTEM_ALGUM]: 'Contém algum de',
  [FiltroOperador.CONTEM_TODOS]: 'Contém todos de',
  [FiltroOperador.NAO_CONTEM_NENHUM]: 'Não contém nenhum de',
};

// Data lê melhor como "depois de / antes de" que "maior / menor".
const ROTULOS_DATA: Partial<Record<FiltroOperador, string>> = {
  [FiltroOperador.IGUAL]: 'Em',
  [FiltroOperador.MAIOR]: 'Depois de',
  [FiltroOperador.MAIOR_OU_IGUAL]: 'Em ou depois de',
  [FiltroOperador.MENOR]: 'Antes de',
  [FiltroOperador.MENOR_OU_IGUAL]: 'Em ou antes de',
  [FiltroOperador.ENTRE]: 'Entre as datas',
};

export function rotuloDoOperador(
  tipo: FiltroTipo,
  operador: FiltroOperador,
): string {
  if (tipo === FiltroTipo.DATA && ROTULOS_DATA[operador]) {
    return ROTULOS_DATA[operador];
  }
  if (tipo === FiltroTipo.BOOLEANO && operador === FiltroOperador.IGUAL) {
    return 'É';
  }
  return ROTULOS_PADRAO[operador];
}
