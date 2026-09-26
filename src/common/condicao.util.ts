import {
  CondicaoOperador,
  CondicaoTipoDado,
  RAMO_CONDICAO_SENAO,
} from './enums/condicao.enum';

export interface RegraCondicaoValor {
  operador: CondicaoOperador;
  // Ausente apenas quando operador é VAZIO/PREENCHIDO.
  valor?: unknown;
  // Só usado com operador ENTRE (limite superior; `valor` é o inferior).
  valorFinal?: unknown;
}

// Usado pelo step CONDICAO (src/integracoes): cada ramo precisa de um `id`
// pra conexões apontarem via `ramoOrigem`. RelatorioModelo.filtros usa só
// RegraCondicaoValor (+ `campo`), sem id — filtro não roteia pra lugar nenhum.
export interface RegraCondicao extends RegraCondicaoValor {
  id: string;
}

function estaVazio(valor: unknown): boolean {
  return valor === null || valor === undefined || valor === '';
}

function paraNumero(valor: unknown): number {
  return typeof valor === 'number' ? valor : Number(valor);
}

function paraBoolean(valor: unknown): boolean {
  if (typeof valor === 'boolean') {
    return valor;
  }
  return String(valor).trim().toLowerCase() === 'true';
}

function paraDataMs(valor: unknown): number {
  return new Date(valor as string | number).getTime();
}

// Avalia uma única regra contra um atributo já resolvido. Exportada (além de
// avaliarCondicao) porque RelatoriosService combina várias regras com E
// (todo filtro precisa bater), diferente do CONDICAO que usa "primeira que
// bater" — a comparação em si é idêntica nos dois casos.
export function avaliarRegra(
  atributo: unknown,
  tipoDado: CondicaoTipoDado,
  regra: RegraCondicaoValor,
): boolean {
  if (regra.operador === CondicaoOperador.VAZIO) {
    return estaVazio(atributo);
  }
  if (regra.operador === CondicaoOperador.PREENCHIDO) {
    return !estaVazio(atributo);
  }
  // Nenhum outro operador compara algo vazio de forma significativa — a
  // regra não bate (cai pra próxima regra/ramo, ou reprova o filtro).
  if (estaVazio(atributo)) {
    return false;
  }

  switch (tipoDado) {
    case CondicaoTipoDado.INTEIRO: {
      const a = paraNumero(atributo);
      const v = paraNumero(regra.valor);
      switch (regra.operador) {
        case CondicaoOperador.IGUAL:
          return a === v;
        case CondicaoOperador.DIFERENTE:
          return a !== v;
        case CondicaoOperador.MAIOR:
          return a > v;
        case CondicaoOperador.MAIOR_OU_IGUAL:
          return a >= v;
        case CondicaoOperador.MENOR:
          return a < v;
        case CondicaoOperador.MENOR_OU_IGUAL:
          return a <= v;
        case CondicaoOperador.ENTRE:
          return a >= v && a <= paraNumero(regra.valorFinal);
        default:
          return false;
      }
    }
    case CondicaoTipoDado.BOOLEAN: {
      if (regra.operador !== CondicaoOperador.IGUAL) {
        return false;
      }
      return paraBoolean(atributo) === paraBoolean(regra.valor);
    }
    case CondicaoTipoDado.STRING: {
      // Campos de múltipla escolha (ex.: CHECKBOX com opções, ver
      // src/relatorios/relatorio-campo.util.ts) guardam o valor como array —
      // CONTEM/NAO_CONTEM viram "um dos selecionados é X" em vez de
      // substring. IGUAL/DIFERENTE/COMECA_COM/TERMINA_COM continuam
      // comparando a representação em string (pouco úteis nesse caso, mas
      // inofensivos).
      if (Array.isArray(atributo)) {
        const itens = atributo.map(String);
        const v = String(regra.valor);
        switch (regra.operador) {
          case CondicaoOperador.CONTEM:
            return itens.includes(v);
          case CondicaoOperador.NAO_CONTEM:
            return !itens.includes(v);
          default:
            break;
        }
      }
      const a = String(atributo);
      const v = String(regra.valor);
      switch (regra.operador) {
        case CondicaoOperador.IGUAL:
          return a === v;
        case CondicaoOperador.DIFERENTE:
          return a !== v;
        case CondicaoOperador.CONTEM:
          return a.includes(v);
        case CondicaoOperador.NAO_CONTEM:
          return !a.includes(v);
        case CondicaoOperador.COMECA_COM:
          return a.startsWith(v);
        case CondicaoOperador.TERMINA_COM:
          return a.endsWith(v);
        default:
          return false;
      }
    }
    case CondicaoTipoDado.DATA: {
      const a = paraDataMs(atributo);
      const v = paraDataMs(regra.valor);
      switch (regra.operador) {
        case CondicaoOperador.IGUAL:
          return a === v;
        case CondicaoOperador.MAIOR:
          return a > v;
        case CondicaoOperador.MAIOR_OU_IGUAL:
          return a >= v;
        case CondicaoOperador.MENOR:
          return a < v;
        case CondicaoOperador.MENOR_OU_IGUAL:
          return a <= v;
        case CondicaoOperador.ENTRE:
          return a >= v && a <= paraDataMs(regra.valorFinal);
        default:
          return false;
      }
    }
  }
}

// Primeira regra do array que bater vence; nenhuma bater cai no ramo
// "senao" (sempre existe, mesmo sem conexão usando ele). Usado só pelo step
// CONDICAO — ver avaliarRegra acima pro caso de filtro (E entre regras).
export function avaliarCondicao(
  atributo: unknown,
  tipoDado: CondicaoTipoDado,
  ramos: RegraCondicao[],
): string {
  for (const regra of ramos) {
    if (avaliarRegra(atributo, tipoDado, regra)) {
      return regra.id;
    }
  }
  return RAMO_CONDICAO_SENAO;
}
