import { UnprocessableEntityException } from '@nestjs/common';
import { Card } from '../entities/card.entity';
import { Processo } from '../../processos/entities/processo.entity';
import { Fase } from '../../fases/entities/fase.entity';
import { CampoFormularioTipo } from '../../processos/formulario/campo-formulario-tipo.enum';
import { FiltroOperador, FiltroTipo } from './card-filtro.enum';
import {
  avaliarFiltro,
  CampoFiltroDisponivel,
  FiltroCard,
  ItemParaFiltro,
  montarCatalogoFiltros,
  montarTextoBusca,
  paraDia,
  tokensDaBusca,
  validarFiltro,
} from './card-filtro.util';

const FUSO = 'America/Sao_Paulo';

const processo = {
  formularioEntrada: [
    {
      id: 'cliente',
      rotulo: 'Cliente',
      tipo: CampoFormularioTipo.TEXTO_CURTO,
      obrigatorio: false,
      ordem: 1,
    },
    {
      id: 'valor',
      rotulo: 'Valor',
      tipo: CampoFormularioTipo.MOEDA,
      obrigatorio: false,
      ordem: 2,
    },
    {
      id: 'prazo',
      rotulo: 'Prazo',
      tipo: CampoFormularioTipo.DATA,
      obrigatorio: false,
      ordem: 3,
    },
    {
      id: 'prioridade',
      rotulo: 'Prioridade',
      tipo: CampoFormularioTipo.SELECAO,
      obrigatorio: false,
      ordem: 4,
      opcoes: ['Alta', 'Baixa'],
    },
    {
      id: 'areas',
      rotulo: 'Áreas',
      tipo: CampoFormularioTipo.CHECKBOX,
      obrigatorio: false,
      ordem: 5,
      opcoes: ['TI', 'RH', 'Financeiro'],
    },
    {
      id: 'urgente',
      rotulo: 'Urgente',
      tipo: CampoFormularioTipo.TOGGLE,
      obrigatorio: false,
      ordem: 6,
    },
    {
      id: 'anexo',
      rotulo: 'Anexo',
      tipo: CampoFormularioTipo.ARQUIVO,
      obrigatorio: false,
      ordem: 7,
    },
    // colide com campo do sistema: o do sistema vence
    {
      id: 'titulo',
      rotulo: 'Titulo do form',
      tipo: CampoFormularioTipo.NUMERO_INTEIRO,
      obrigatorio: false,
      ordem: 8,
    },
  ],
} as unknown as Processo;

const fases = [
  { id: 'f1', nome: 'Novo', cor: null, isFinal: false, formularioFase: [] },
  {
    id: 'f2',
    nome: 'Concluído',
    cor: '#00FF00',
    isFinal: true,
    formularioFase: [
      {
        id: 'nota',
        rotulo: 'Nota',
        tipo: CampoFormularioTipo.NUMERO_INTEIRO,
        obrigatorio: false,
        ordem: 1,
      },
    ],
  },
] as unknown as Fase[];

const catalogo = montarCatalogoFiltros(processo, fases);
const porCampo = new Map(catalogo.map((c) => [c.campo, c]));

function item(
  card: Partial<Card>,
  extra: Partial<ItemParaFiltro> = {},
): ItemParaFiltro {
  return {
    card: {
      titulo: 'Card',
      campos: {},
      faseAtualId: 'f1',
      dataVencimento: null,
      createdAt: new Date('2026-09-20T15:00:00Z'),
      updatedAt: new Date('2026-09-20T15:00:00Z'),
      ...card,
    } as Card,
    responsaveis: [],
    etiquetas: [],
    ...extra,
  };
}

function casa(it: ItemParaFiltro, filtro: FiltroCard): boolean {
  const info = porCampo.get(filtro.campo) as CampoFiltroDisponivel;
  validarFiltro(filtro, info, FUSO);
  return avaliarFiltro(
    it,
    info,
    filtro,
    FUSO,
    new Date('2026-09-20T12:00:00Z'),
  );
}

describe('montarCatalogoFiltros', () => {
  it('mapeia tipos, ignora ARQUIVO e deixa o campo do sistema vencer', () => {
    expect(porCampo.get('cliente')?.tipo).toBe(FiltroTipo.TEXTO);
    expect(porCampo.get('valor')?.tipo).toBe(FiltroTipo.NUMERO);
    expect(porCampo.get('prazo')?.tipo).toBe(FiltroTipo.DATA);
    expect(porCampo.get('prioridade')?.tipo).toBe(FiltroTipo.SELECAO);
    expect(porCampo.get('areas')?.tipo).toBe(FiltroTipo.MULTIPLA_ESCOLHA);
    expect(porCampo.get('urgente')?.tipo).toBe(FiltroTipo.BOOLEANO);
    expect(porCampo.get('nota')?.formulario).toBe('FASE');
    expect(porCampo.get('nota')?.faseId).toBe('f2');
    expect(porCampo.has('anexo')).toBe(false);
    expect(porCampo.get('titulo')?.tipo).toBe(FiltroTipo.TEXTO);
  });

  it('expõe fases (com isFinal) e opções dos campos de seleção', () => {
    expect(porCampo.get('faseAtualId')?.opcoes).toEqual([
      { valor: 'f1', rotulo: 'Novo', cor: null, isFinal: false },
      { valor: 'f2', rotulo: 'Concluído', cor: '#00FF00', isFinal: true },
    ]);
    expect(porCampo.get('prioridade')?.opcoes?.map((o) => o.valor)).toEqual([
      'Alta',
      'Baixa',
    ]);
  });

  it('rotula operadores de data como depois de / antes de', () => {
    const ops = porCampo.get('createdAt')?.operadores ?? [];
    expect(ops.find((o) => o.operador === FiltroOperador.MAIOR)?.rotulo).toBe(
      'Depois de',
    );
    expect(ops.find((o) => o.operador === FiltroOperador.ENTRE)?.entrada).toBe(
      'INTERVALO',
    );
  });
});

describe('validarFiltro', () => {
  const valida = (f: FiltroCard) =>
    validarFiltro(f, porCampo.get(f.campo), FUSO);

  it('rejeita campo desconhecido e operador incompatível com o tipo', () => {
    expect(() =>
      valida({ campo: 'naoExiste', operador: FiltroOperador.IGUAL, valor: 1 }),
    ).toThrow(UnprocessableEntityException);
    expect(() =>
      valida({ campo: 'valor', operador: FiltroOperador.CONTEM, valor: '1' }),
    ).toThrow(/inválido para o campo/);
  });

  it('exige valor do tipo certo', () => {
    expect(() =>
      valida({ campo: 'valor', operador: FiltroOperador.MAIOR, valor: 'abc' }),
    ).toThrow(/deve ser um número/);
    expect(() =>
      valida({
        campo: 'prazo',
        operador: FiltroOperador.IGUAL,
        valor: '31/12',
      }),
    ).toThrow(/data válida/);
    expect(() =>
      valida({ campo: 'urgente', operador: FiltroOperador.IGUAL, valor: 1 }),
    ).toThrow(/true ou false/);
    expect(() =>
      valida({ campo: 'titulo', operador: FiltroOperador.CONTEM, valor: '' }),
    ).toThrow(/texto não vazio/);
  });

  it('exige lista nos operadores de conjunto e valida vencimento', () => {
    expect(() =>
      valida({
        campo: 'faseAtualId',
        operador: FiltroOperador.EM,
        valor: 'f1',
      }),
    ).toThrow(/lista/);
    expect(() =>
      valida({ campo: 'faseAtualId', operador: FiltroOperador.EM, valor: [] }),
    ).toThrow(/lista/);
    expect(() =>
      valida({
        campo: 'vencimento',
        operador: FiltroOperador.EM,
        valor: ['ATRASADO'],
      }),
    ).toThrow(/vencimento inválida/);
  });

  it('valida ENTRE (ambos os limites e ordem)', () => {
    expect(() =>
      valida({ campo: 'valor', operador: FiltroOperador.ENTRE, valor: 1 }),
    ).toThrow(/valorFinal/);
    expect(() =>
      valida({
        campo: 'valor',
        operador: FiltroOperador.ENTRE,
        valor: 10,
        valorFinal: 1,
      }),
    ).toThrow(/não pode ser maior/);
    expect(() =>
      valida({
        campo: 'prazo',
        operador: FiltroOperador.ENTRE,
        valor: '2026-01-01',
        valorFinal: '2026-12-31',
      }),
    ).not.toThrow();
  });

  it('VAZIO/PREENCHIDO não exigem valor', () => {
    expect(() =>
      valida({ campo: 'prazo', operador: FiltroOperador.VAZIO }),
    ).not.toThrow();
  });
});

describe('avaliarFiltro', () => {
  it('TEXTO ignora maiúscula e acento; negativos casam com vazio', () => {
    const it1 = item({ campos: { cliente: 'João da Silva' } });
    expect(
      casa(it1, {
        campo: 'cliente',
        operador: FiltroOperador.CONTEM,
        valor: 'JOAO',
      }),
    ).toBe(true);
    expect(
      casa(it1, {
        campo: 'cliente',
        operador: FiltroOperador.COMECA_COM,
        valor: 'joão d',
      }),
    ).toBe(true);
    expect(
      casa(it1, {
        campo: 'cliente',
        operador: FiltroOperador.NAO_CONTEM,
        valor: 'maria',
      }),
    ).toBe(true);
    const vazio = item({ campos: {} });
    expect(
      casa(vazio, {
        campo: 'cliente',
        operador: FiltroOperador.NAO_CONTEM,
        valor: 'maria',
      }),
    ).toBe(true);
    expect(
      casa(vazio, {
        campo: 'cliente',
        operador: FiltroOperador.CONTEM,
        valor: 'maria',
      }),
    ).toBe(false);
    expect(
      casa(vazio, { campo: 'cliente', operador: FiltroOperador.VAZIO }),
    ).toBe(true);
  });

  it('NUMERO compara, aceita formato brasileiro e ENTRE é inclusivo', () => {
    const it1 = item({ campos: { valor: '1.234,50' } });
    expect(
      casa(it1, {
        campo: 'valor',
        operador: FiltroOperador.MAIOR,
        valor: 1000,
      }),
    ).toBe(true);
    expect(
      casa(it1, {
        campo: 'valor',
        operador: FiltroOperador.ENTRE,
        valor: 1234.5,
        valorFinal: 2000,
      }),
    ).toBe(true);
    expect(
      casa(item({ campos: { valor: 5 } }), {
        campo: 'valor',
        operador: FiltroOperador.MENOR_OU_IGUAL,
        valor: 4,
      }),
    ).toBe(false);
    expect(
      casa(item({}), {
        campo: 'valor',
        operador: FiltroOperador.MAIOR,
        valor: 0,
      }),
    ).toBe(false);
  });

  it('DATA compara por dia; createdAt usa o fuso', () => {
    const it1 = item({ campos: { prazo: '2026-10-15' } });
    expect(
      casa(it1, {
        campo: 'prazo',
        operador: FiltroOperador.ENTRE,
        valor: '2026-10-15',
        valorFinal: '2026-10-20',
      }),
    ).toBe(true);
    expect(
      casa(it1, {
        campo: 'prazo',
        operador: FiltroOperador.MENOR,
        valor: '2026-10-15',
      }),
    ).toBe(false);
    // ISO à meia-noite UTC continua sendo o dia 15 (prefixo literal).
    expect(
      casa(item({ campos: { prazo: '2026-10-15T00:00:00.000Z' } }), {
        campo: 'prazo',
        operador: FiltroOperador.IGUAL,
        valor: '2026-10-15',
      }),
    ).toBe(true);
    // 01:00Z do dia 21 ainda é dia 20 em São Paulo (UTC-3).
    const criado = item({ createdAt: new Date('2026-09-21T01:00:00Z') });
    expect(
      casa(criado, {
        campo: 'createdAt',
        operador: FiltroOperador.IGUAL,
        valor: '2026-09-20',
      }),
    ).toBe(true);
  });

  it('BOOLEANO trata ausente como false', () => {
    expect(
      casa(item({}), {
        campo: 'urgente',
        operador: FiltroOperador.IGUAL,
        valor: false,
      }),
    ).toBe(true);
    expect(
      casa(item({ campos: { urgente: true } }), {
        campo: 'urgente',
        operador: FiltroOperador.IGUAL,
        valor: true,
      }),
    ).toBe(true);
  });

  it('SELECAO e FASE usam EM / NAO_EM', () => {
    const it1 = item({ campos: { prioridade: 'Alta' } });
    expect(
      casa(it1, {
        campo: 'prioridade',
        operador: FiltroOperador.EM,
        valor: ['Alta', 'Baixa'],
      }),
    ).toBe(true);
    expect(
      casa(item({}), {
        campo: 'prioridade',
        operador: FiltroOperador.NAO_EM,
        valor: ['Alta'],
      }),
    ).toBe(true);
    expect(
      casa(it1, {
        campo: 'faseAtualId',
        operador: FiltroOperador.NAO_EM,
        valor: ['f2'],
      }),
    ).toBe(true);
  });

  it('MULTIPLA_ESCOLHA, USUARIO e ETIQUETA usam ALGUM / TODOS / NENHUM', () => {
    const it1 = item(
      { campos: { areas: ['TI', 'RH'] } },
      {
        responsaveis: [{ id: 'u1', nome: 'Ana', email: 'a@x.com' }],
        etiquetas: [
          { id: 'e1', nome: 'Bug' },
          { id: 'e2', nome: 'Front' },
        ],
      },
    );
    expect(
      casa(it1, {
        campo: 'areas',
        operador: FiltroOperador.CONTEM_TODOS,
        valor: ['TI', 'RH'],
      }),
    ).toBe(true);
    expect(
      casa(it1, {
        campo: 'areas',
        operador: FiltroOperador.CONTEM_TODOS,
        valor: ['TI', 'Financeiro'],
      }),
    ).toBe(false);
    expect(
      casa(it1, {
        campo: 'responsaveis',
        operador: FiltroOperador.CONTEM_ALGUM,
        valor: ['u1', 'u9'],
      }),
    ).toBe(true);
    expect(
      casa(it1, {
        campo: 'etiquetas',
        operador: FiltroOperador.NAO_CONTEM_NENHUM,
        valor: ['e3'],
      }),
    ).toBe(true);
    expect(
      casa(item({}), { campo: 'responsaveis', operador: FiltroOperador.VAZIO }),
    ).toBe(true);
    expect(
      casa(it1, { campo: 'etiquetas', operador: FiltroOperador.PREENCHIDO }),
    ).toBe(true);
  });

  it('VENCIMENTO deriva o status na hora (agora = 2026-09-20T12:00Z)', () => {
    const vencido = item({ dataVencimento: new Date('2026-09-19T12:00:00Z') });
    const semData = item({});
    expect(
      casa(vencido, {
        campo: 'vencimento',
        operador: FiltroOperador.EM,
        valor: ['VENCIDO'],
      }),
    ).toBe(true);
    expect(
      casa(semData, {
        campo: 'vencimento',
        operador: FiltroOperador.EM,
        valor: ['SEM_VENCIMENTO'],
      }),
    ).toBe(true);
    expect(
      casa(semData, {
        campo: 'vencimento',
        operador: FiltroOperador.NAO_EM,
        valor: ['VENCIDO', 'PRESTES_A_VENCER'],
      }),
    ).toBe(true);
    expect(
      casa(vencido, {
        campo: 'dataVencimento',
        operador: FiltroOperador.PREENCHIDO,
      }),
    ).toBe(true);
  });
});

describe('busca livre', () => {
  const it1 = item(
    {
      titulo: 'Contrato Acme',
      campos: { cliente: 'João da Silva', valor: 500, urgente: true },
    },
    {
      responsaveis: [{ id: 'u1', nome: 'Ana Paula', email: 'ana@x.com' }],
      etiquetas: [{ id: 'e1', nome: 'Financeiro' }],
    },
  );
  const acha = (busca: string) => {
    const texto = montarTextoBusca(it1);
    return tokensDaBusca(busca).every((t) => texto.includes(t));
  };

  it('acha por título, campo, etiqueta e responsável, sem acento/caixa', () => {
    expect(acha('acme')).toBe(true);
    expect(acha('joao silva')).toBe(true);
    expect(acha('500')).toBe(true);
    expect(acha('financeiro')).toBe(true);
    expect(acha('ANA@X')).toBe(true);
  });

  it('exige todas as palavras e ignora booleanos', () => {
    expect(acha('acme maria')).toBe(false);
    expect(acha('true')).toBe(false);
    expect(tokensDaBusca('   ')).toEqual([]);
  });
});

describe('paraDia', () => {
  it('rejeita datas impossíveis', () => {
    expect(paraDia('2026-02-30', FUSO)).toBeNull();
    expect(paraDia('lixo', FUSO)).toBeNull();
    expect(paraDia('2026-02-28', FUSO)).toBe('2026-02-28');
  });
});
