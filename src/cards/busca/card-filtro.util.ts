import { UnprocessableEntityException } from '@nestjs/common';
import { Card } from '../entities/card.entity';
import { Processo } from '../../processos/entities/processo.entity';
import { Fase } from '../../fases/entities/fase.entity';
import { CampoFormularioTipo } from '../../processos/formulario/campo-formulario-tipo.enum';
import { calcularVencimento, VencimentoFiltro } from '../vencimento.util';
import {
  entradaDoOperador,
  FiltroEntrada,
  FiltroOperador,
  FiltroTipo,
  OPERADORES_POR_TIPO_FILTRO,
  rotuloDoOperador,
} from './card-filtro.enum';

export const FUSO_HORARIO_PADRAO = 'America/Sao_Paulo';
export const MAX_FILTROS = 30;
export const MAX_ITENS_LISTA = 100;

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
  cor?: string | null;
  email?: string;
  isFinal?: boolean;
}

export interface OperadorFiltroDisponivel {
  operador: FiltroOperador;
  rotulo: string;
  entrada: FiltroEntrada;
}

export interface CampoFiltroDisponivel {
  campo: string;
  rotulo: string;
  tipo: FiltroTipo;
  origem: 'sistema' | 'formulario';
  // Só origem 'formulario': de onde vem o campo, pro front agrupar.
  formulario: 'ENTRADA' | 'FASE' | null;
  faseId: string | null;
  // Só tipos com conjunto fechado (SELECAO, MULTIPLA_ESCOLHA, FASE, USUARIO,
  // ETIQUETA, VENCIMENTO); null nos demais.
  opcoes: OpcaoFiltro[] | null;
  operadores: OperadorFiltroDisponivel[];
}

export interface FiltroCard {
  campo: string;
  operador: FiltroOperador;
  valor?: unknown;
  valorFinal?: unknown;
}

export interface ItemParaFiltro {
  card: Card;
  responsaveis: { id: string; nome: string; email: string }[];
  etiquetas: { id: string; nome: string }[];
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

type CampoBase = Omit<
  CampoFiltroDisponivel,
  'operadores' | 'formulario' | 'faseId'
> &
  Partial<Pick<CampoFiltroDisponivel, 'formulario' | 'faseId'>>;

function montarCampo(c: CampoBase): CampoFiltroDisponivel {
  return {
    formulario: null,
    faseId: null,
    ...c,
    operadores: OPERADORES_POR_TIPO_FILTRO[c.tipo].map((operador) => ({
      operador,
      rotulo: rotuloDoOperador(c.tipo, operador),
      entrada: entradaDoOperador(operador),
    })),
  };
}

const OPCOES_VENCIMENTO: OpcaoFiltro[] = [
  { valor: VencimentoFiltro.VENCIDO, rotulo: 'Vencido' },
  { valor: VencimentoFiltro.PRESTES_A_VENCER, rotulo: 'Prestes a vencer' },
  { valor: VencimentoFiltro.NO_PRAZO, rotulo: 'No prazo' },
  { valor: VencimentoFiltro.SEM_VENCIMENTO, rotulo: 'Sem vencimento' },
];

// ARQUIVO não entra: o upload vai por CardAnexo, sem gravar valor em
// card.campos (mesma razão do catálogo de relatórios).
function tipoDoCampoFormulario(
  tipo: CampoFormularioTipo,
  temOpcoes: boolean,
): FiltroTipo | null {
  switch (tipo) {
    case CampoFormularioTipo.TEXTO_CURTO:
    case CampoFormularioTipo.TEXTO_LONGO:
      return FiltroTipo.TEXTO;
    case CampoFormularioTipo.NUMERO_INTEIRO:
    case CampoFormularioTipo.MOEDA:
      return FiltroTipo.NUMERO;
    case CampoFormularioTipo.DATA:
      return FiltroTipo.DATA;
    case CampoFormularioTipo.SELECAO:
    case CampoFormularioTipo.RADIO:
      return FiltroTipo.SELECAO;
    case CampoFormularioTipo.CHECKBOX:
      return temOpcoes ? FiltroTipo.MULTIPLA_ESCOLHA : FiltroTipo.BOOLEANO;
    case CampoFormularioTipo.TOGGLE:
      return FiltroTipo.BOOLEANO;
    case CampoFormularioTipo.ARQUIVO:
      return null;
  }
}

// Campos do sistema primeiro (têm precedência sobre um campo de formulário
// com o mesmo id), depois formularioEntrada e formularioFase na ordem das
// fases — em colisão entre formulários, a primeira ocorrência vence.
export function montarCatalogoFiltros(
  processo: Processo,
  fases: Fase[],
  etiquetas: { id: string; nome: string; cor: string }[] = [],
  usuarios: { id: string; nome: string; email: string }[] = [],
): CampoFiltroDisponivel[] {
  const sistema: CampoFiltroDisponivel[] = [
    montarCampo({
      campo: 'titulo',
      rotulo: 'Título',
      tipo: FiltroTipo.TEXTO,
      origem: 'sistema',
      opcoes: null,
    }),
    montarCampo({
      campo: 'faseAtualId',
      rotulo: 'Fase',
      tipo: FiltroTipo.FASE,
      origem: 'sistema',
      opcoes: fases.map((f) => ({
        valor: f.id,
        rotulo: f.nome,
        cor: f.cor,
        isFinal: f.isFinal,
      })),
    }),
    montarCampo({
      campo: 'responsaveis',
      rotulo: 'Responsáveis',
      tipo: FiltroTipo.USUARIO,
      origem: 'sistema',
      opcoes: usuarios.map((u) => ({
        valor: u.id,
        rotulo: u.nome,
        email: u.email,
      })),
    }),
    montarCampo({
      campo: 'etiquetas',
      rotulo: 'Etiquetas',
      tipo: FiltroTipo.ETIQUETA,
      origem: 'sistema',
      opcoes: etiquetas.map((e) => ({
        valor: e.id,
        rotulo: e.nome,
        cor: e.cor,
      })),
    }),
    montarCampo({
      campo: 'vencimento',
      rotulo: 'Situação do vencimento',
      tipo: FiltroTipo.VENCIMENTO,
      origem: 'sistema',
      opcoes: OPCOES_VENCIMENTO,
    }),
    montarCampo({
      campo: 'dataVencimento',
      rotulo: 'Data de vencimento',
      tipo: FiltroTipo.DATA,
      origem: 'sistema',
      opcoes: null,
    }),
    montarCampo({
      campo: 'createdAt',
      rotulo: 'Criado em',
      tipo: FiltroTipo.DATA,
      origem: 'sistema',
      opcoes: null,
    }),
    montarCampo({
      campo: 'updatedAt',
      rotulo: 'Atualizado em',
      tipo: FiltroTipo.DATA,
      origem: 'sistema',
      opcoes: null,
    }),
  ];

  const vistos = new Set(sistema.map((c) => c.campo));
  const doFormulario: CampoFiltroDisponivel[] = [];
  const definicoes = [
    ...processo.formularioEntrada.map((def) => ({
      def,
      formulario: 'ENTRADA' as const,
      faseId: null as string | null,
    })),
    ...fases.flatMap((fase) =>
      fase.formularioFase.map((def) => ({
        def,
        formulario: 'FASE' as const,
        faseId: fase.id,
      })),
    ),
  ];
  for (const { def, formulario, faseId } of definicoes) {
    if (vistos.has(def.id)) continue;
    const tipo = tipoDoCampoFormulario(def.tipo, (def.opcoes ?? []).length > 0);
    if (!tipo) continue;
    vistos.add(def.id);
    doFormulario.push(
      montarCampo({
        campo: def.id,
        rotulo: def.rotulo,
        tipo,
        origem: 'formulario',
        formulario,
        faseId,
        opcoes:
          tipo === FiltroTipo.SELECAO || tipo === FiltroTipo.MULTIPLA_ESCOLHA
            ? (def.opcoes ?? []).map((o) => ({ valor: o, rotulo: o }))
            : null,
      }),
    );
  }

  return [...sistema, ...doFormulario];
}

// ---------------------------------------------------------------------------
// Normalização de valores
// ---------------------------------------------------------------------------

export function normalizarTexto(valor: unknown): string {
  return String(valor)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function estaVazio(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === 'string') return valor.trim() === '';
  if (Array.isArray(valor)) return valor.length === 0;
  return false;
}

// Aceita número, "1234.5" e "1.234,56" (formato brasileiro, ex.: MOEDA).
function paraNumero(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;
  if (typeof valor !== 'string' || valor.trim() === '') return NaN;
  const s = valor.trim();
  const normalizado = s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')
    : s;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : NaN;
}

function paraBooleano(valor: unknown): boolean | null {
  if (typeof valor === 'boolean') return valor;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  return null;
}

function diaValido(dia: string): boolean {
  const [a, m, d] = dia.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return (
    dt.getUTCFullYear() === a &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

const formatadores = new Map<string, Intl.DateTimeFormat>();
function formatadorDeDia(fuso: string): Intl.DateTimeFormat {
  let f = formatadores.get(fuso);
  if (!f) {
    // en-CA formata como YYYY-MM-DD.
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatadores.set(fuso, f);
  }
  return f;
}

export function validarFusoHorario(fuso: string): void {
  try {
    formatadorDeDia(fuso);
  } catch {
    throw new UnprocessableEntityException(
      `Fuso horário inválido: "${fuso}" (use um nome IANA, ex.: America/Sao_Paulo)`,
    );
  }
}

// Toda comparação de data é em nível de DIA (YYYY-MM-DD). String começando
// com YYYY-MM-DD usa esse prefixo literal (é o que o front grava em campos
// DATA — não passa por fuso, senão "2026-09-20T00:00:00Z" viraria dia 19).
// Date de verdade (createdAt/updatedAt/dataVencimento) é convertida pro dia
// no fuso informado.
export function paraDia(valor: unknown, fuso: string): string | null {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime())
      ? null
      : formatadorDeDia(fuso).format(valor);
  }
  if (typeof valor !== 'string') return null;
  const prefixo = /^(\d{4}-\d{2}-\d{2})/.exec(valor.trim());
  if (prefixo) {
    return diaValido(prefixo[1]) ? prefixo[1] : null;
  }
  const dt = new Date(valor);
  return Number.isNaN(dt.getTime()) ? null : formatadorDeDia(fuso).format(dt);
}

function comoLista(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.map(String);
  if (estaVazio(valor)) return [];
  return [String(valor)];
}

// ---------------------------------------------------------------------------
// Validação do filtro contra o catálogo
// ---------------------------------------------------------------------------

function exigirValorDoTipo(
  info: CampoFiltroDisponivel,
  valor: unknown,
  nome: 'valor' | 'valorFinal',
  fuso: string,
): void {
  const erro = (msg: string) =>
    new UnprocessableEntityException(
      `Filtro em "${info.campo}": "${nome}" ${msg}`,
    );
  switch (info.tipo) {
    case FiltroTipo.TEXTO:
      if (typeof valor !== 'string' || valor.trim() === '') {
        throw erro('deve ser um texto não vazio');
      }
      return;
    case FiltroTipo.NUMERO:
      if (Number.isNaN(paraNumero(valor))) {
        throw erro('deve ser um número');
      }
      return;
    case FiltroTipo.DATA:
      if (paraDia(valor, fuso) === null) {
        throw erro('deve ser uma data válida (YYYY-MM-DD)');
      }
      return;
    case FiltroTipo.BOOLEANO:
      if (paraBooleano(valor) === null) {
        throw erro('deve ser true ou false');
      }
      return;
    default:
      throw erro('não se aplica a este tipo de campo');
  }
}

export function validarFiltro(
  filtro: FiltroCard,
  info: CampoFiltroDisponivel | undefined,
  fuso: string,
): void {
  if (!info) {
    throw new UnprocessableEntityException(
      `Campo de filtro desconhecido: "${filtro.campo}"`,
    );
  }
  if (!OPERADORES_POR_TIPO_FILTRO[info.tipo].includes(filtro.operador)) {
    throw new UnprocessableEntityException(
      `Operador "${filtro.operador}" inválido para o campo "${filtro.campo}" (tipo ${info.tipo})`,
    );
  }

  switch (entradaDoOperador(filtro.operador)) {
    case FiltroEntrada.NENHUM:
      return;
    case FiltroEntrada.UNICO:
      exigirValorDoTipo(info, filtro.valor, 'valor', fuso);
      return;
    case FiltroEntrada.INTERVALO: {
      exigirValorDoTipo(info, filtro.valor, 'valor', fuso);
      exigirValorDoTipo(info, filtro.valorFinal, 'valorFinal', fuso);
      const inicio =
        info.tipo === FiltroTipo.DATA
          ? paraDia(filtro.valor, fuso)!
          : paraNumero(filtro.valor);
      const fim =
        info.tipo === FiltroTipo.DATA
          ? paraDia(filtro.valorFinal, fuso)!
          : paraNumero(filtro.valorFinal);
      if (inicio > fim) {
        throw new UnprocessableEntityException(
          `Filtro em "${info.campo}": "valor" não pode ser maior que "valorFinal" no operador ENTRE`,
        );
      }
      return;
    }
    case FiltroEntrada.LISTA: {
      const lista = filtro.valor;
      if (
        !Array.isArray(lista) ||
        lista.length === 0 ||
        lista.length > MAX_ITENS_LISTA ||
        lista.some((v) => typeof v !== 'string' || v === '')
      ) {
        throw new UnprocessableEntityException(
          `Filtro em "${info.campo}": "valor" deve ser uma lista de 1 a ${MAX_ITENS_LISTA} textos`,
        );
      }
      if (info.tipo === FiltroTipo.VENCIMENTO) {
        const validos = new Set<string>(Object.values(VencimentoFiltro));
        const invalido = (lista as string[]).find((v) => !validos.has(v));
        if (invalido) {
          throw new UnprocessableEntityException(
            `Filtro em "${info.campo}": situação de vencimento inválida "${invalido}"`,
          );
        }
      }
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Avaliação
// ---------------------------------------------------------------------------

function atributoDoCard(
  item: ItemParaFiltro,
  campoId: string,
  agora: Date,
): unknown {
  const { card } = item;
  switch (campoId) {
    case 'titulo':
      return card.titulo;
    case 'faseAtualId':
      return card.faseAtualId;
    case 'responsaveis':
      return item.responsaveis.map((r) => r.id);
    case 'etiquetas':
      return item.etiquetas.map((e) => e.id);
    case 'vencimento':
      return (
        calcularVencimento(card.dataVencimento, agora)?.status ??
        VencimentoFiltro.SEM_VENCIMENTO
      );
    case 'dataVencimento':
      return card.dataVencimento;
    case 'createdAt':
      return card.createdAt;
    case 'updatedAt':
      return card.updatedAt;
    default:
      return card.campos[campoId] ?? null;
  }
}

// Operadores "negativos" também casam com atributo vazio (é o esperado de
// "não contém X" / "diferente de X" / "não é nenhum de"): card sem valor não
// tem X. Já os comparativos (maior, entre, contém…) nunca casam com vazio.
export function avaliarFiltro(
  item: ItemParaFiltro,
  info: CampoFiltroDisponivel,
  filtro: FiltroCard,
  fuso: string,
  agora: Date = new Date(),
): boolean {
  const atributo = atributoDoCard(item, info.campo, agora);
  const op = filtro.operador;

  if (op === FiltroOperador.VAZIO) return estaVazio(atributo);
  if (op === FiltroOperador.PREENCHIDO) return !estaVazio(atributo);

  switch (info.tipo) {
    case FiltroTipo.TEXTO: {
      const negativo =
        op === FiltroOperador.DIFERENTE || op === FiltroOperador.NAO_CONTEM;
      if (estaVazio(atributo)) return negativo;
      const a = normalizarTexto(
        Array.isArray(atributo) ? atributo.join(' ') : atributo,
      );
      const v = normalizarTexto(filtro.valor);
      switch (op) {
        case FiltroOperador.IGUAL:
          return a === v;
        case FiltroOperador.DIFERENTE:
          return a !== v;
        case FiltroOperador.CONTEM:
          return a.includes(v);
        case FiltroOperador.NAO_CONTEM:
          return !a.includes(v);
        case FiltroOperador.COMECA_COM:
          return a.startsWith(v);
        case FiltroOperador.TERMINA_COM:
          return a.endsWith(v);
        default:
          return false;
      }
    }
    case FiltroTipo.NUMERO: {
      if (estaVazio(atributo)) return op === FiltroOperador.DIFERENTE;
      const a = paraNumero(atributo);
      if (Number.isNaN(a)) return op === FiltroOperador.DIFERENTE;
      const v = paraNumero(filtro.valor);
      switch (op) {
        case FiltroOperador.IGUAL:
          return a === v;
        case FiltroOperador.DIFERENTE:
          return a !== v;
        case FiltroOperador.MAIOR:
          return a > v;
        case FiltroOperador.MAIOR_OU_IGUAL:
          return a >= v;
        case FiltroOperador.MENOR:
          return a < v;
        case FiltroOperador.MENOR_OU_IGUAL:
          return a <= v;
        case FiltroOperador.ENTRE:
          return a >= v && a <= paraNumero(filtro.valorFinal);
        default:
          return false;
      }
    }
    case FiltroTipo.DATA: {
      const a = paraDia(atributo, fuso);
      if (a === null) return false;
      const v = paraDia(filtro.valor, fuso)!;
      switch (op) {
        case FiltroOperador.IGUAL:
          return a === v;
        case FiltroOperador.MAIOR:
          return a > v;
        case FiltroOperador.MAIOR_OU_IGUAL:
          return a >= v;
        case FiltroOperador.MENOR:
          return a < v;
        case FiltroOperador.MENOR_OU_IGUAL:
          return a <= v;
        case FiltroOperador.ENTRE:
          return a >= v && a <= paraDia(filtro.valorFinal, fuso)!;
        default:
          return false;
      }
    }
    case FiltroTipo.BOOLEANO:
      // Ausente/null conta como desligado (toggle nunca tocado = false).
      return (paraBooleano(atributo) ?? false) === paraBooleano(filtro.valor);
    case FiltroTipo.SELECAO:
    case FiltroTipo.FASE:
    case FiltroTipo.VENCIMENTO: {
      const valores = filtro.valor as string[];
      const casa = comoLista(atributo).some((a) => valores.includes(a));
      return op === FiltroOperador.NAO_EM ? !casa : casa;
    }
    case FiltroTipo.MULTIPLA_ESCOLHA:
    case FiltroTipo.USUARIO:
    case FiltroTipo.ETIQUETA: {
      const itens = comoLista(atributo);
      const valores = filtro.valor as string[];
      switch (op) {
        case FiltroOperador.CONTEM_ALGUM:
          return valores.some((v) => itens.includes(v));
        case FiltroOperador.CONTEM_TODOS:
          return valores.every((v) => itens.includes(v));
        case FiltroOperador.NAO_CONTEM_NENHUM:
          return !valores.some((v) => itens.includes(v));
        default:
          return false;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Busca livre (search)
// ---------------------------------------------------------------------------

function valoresDeTexto(valor: unknown): string[] {
  if (typeof valor === 'string') return [valor];
  if (typeof valor === 'number') return [String(valor)];
  if (Array.isArray(valor)) return valor.flatMap(valoresDeTexto);
  return [];
}

// Texto pesquisável do card: título, valor de todos os campos (exceto
// booleanos), nome das etiquetas e nome/e-mail dos responsáveis.
export function montarTextoBusca(item: ItemParaFiltro): string {
  const partes = [
    item.card.titulo,
    ...Object.values(item.card.campos).flatMap(valoresDeTexto),
    ...item.etiquetas.map((e) => e.nome),
    ...item.responsaveis.flatMap((r) => [r.nome, r.email]),
  ];
  return normalizarTexto(partes.join('\n'));
}

// Cada palavra da busca precisa aparecer em algum lugar (E entre palavras),
// sem diferenciar maiúscula/acento — "joao silva" acha "João da Silva".
export function tokensDaBusca(busca: string | undefined): string[] {
  return normalizarTexto(busca ?? '')
    .split(/\s+/)
    .filter(Boolean);
}
