import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { CampoFormulario } from '../processos/formulario/campo-formulario.interface';
import { CampoFormularioTipo } from '../processos/formulario/campo-formulario-tipo.enum';
import {
  CondicaoOperador,
  CondicaoTipoDado,
  OPERADORES_COM_VALOR_FINAL,
  OPERADORES_POR_TIPO_DADO,
  OPERADORES_SEM_VALOR,
} from '../common/enums/condicao.enum';

// Campos que todo card tem, fora de `campos` (jsonb) — sempre disponíveis
// como coluna/filtro de relatório, em qualquer processo. `id` só serve como
// coluna (sem categoria = não filtrável): não há caso de uso pra filtrar por
// id exato aqui, e comparação de igualdade de uuid não passa por
// avaliarRegra hoje.
export const CAMPOS_RESERVADOS_RELATORIO: {
  campo: string;
  rotulo: string;
  categoria: CondicaoTipoDado | null;
}[] = [
  { campo: 'id', rotulo: 'ID do card', categoria: null },
  { campo: 'titulo', rotulo: 'Título', categoria: CondicaoTipoDado.STRING },
  {
    campo: 'faseAtualId',
    rotulo: 'Fase atual',
    categoria: CondicaoTipoDado.STRING,
  },
  { campo: 'createdAt', rotulo: 'Criado em', categoria: CondicaoTipoDado.DATA },
  {
    campo: 'updatedAt',
    rotulo: 'Atualizado em',
    categoria: CondicaoTipoDado.DATA,
  },
];

const CAMPOS_RESERVADOS_POR_ID = new Map(
  CAMPOS_RESERVADOS_RELATORIO.map((c) => [c.campo, c]),
);

// ARQUIVO nunca aparece aqui: o valor de um campo de formulário tipo ARQUIVO
// não é gravado em card.campos (upload de fato vai por CardAnexo, sem ligação
// de volta com o id do campo do formulário) — não há o que mostrar ou
// filtrar de forma confiável hoje.
function categoriaPorTipoCampoFormulario(
  campo: CampoFormulario,
): CondicaoTipoDado | null {
  switch (campo.tipo) {
    case CampoFormularioTipo.TEXTO_CURTO:
    case CampoFormularioTipo.TEXTO_LONGO:
    case CampoFormularioTipo.SELECAO:
    case CampoFormularioTipo.RADIO:
      return CondicaoTipoDado.STRING;
    case CampoFormularioTipo.NUMERO_INTEIRO:
    case CampoFormularioTipo.MOEDA:
      return CondicaoTipoDado.INTEIRO;
    case CampoFormularioTipo.DATA:
      return CondicaoTipoDado.DATA;
    case CampoFormularioTipo.CHECKBOX:
      // Com `opcoes`, o valor gravado é um array (múltipla escolha) — trata
      // como STRING mesmo assim (avaliarRegra em common/condicao.util.ts já
      // sabe comparar CONTEM/NAO_CONTEM contra array). Sem `opcoes`, é um
      // checkbox único (valor booleano), igual TOGGLE.
      return campo.opcoes && campo.opcoes.length > 0
        ? CondicaoTipoDado.STRING
        : CondicaoTipoDado.BOOLEAN;
    case CampoFormularioTipo.TOGGLE:
      return CondicaoTipoDado.BOOLEAN;
    case CampoFormularioTipo.ARQUIVO:
      return null;
  }
}

export interface OperadorDisponivel {
  operador: CondicaoOperador;
  exigeValor: boolean;
  exigeValorFinal: boolean;
}

function operadoresDisponiveis(
  categoria: CondicaoTipoDado,
): OperadorDisponivel[] {
  return OPERADORES_POR_TIPO_DADO[categoria].map((operador) => ({
    operador,
    exigeValor: !OPERADORES_SEM_VALOR.has(operador),
    exigeValorFinal: OPERADORES_COM_VALOR_FINAL.has(operador),
  }));
}

export interface CampoRelatorioDisponivel {
  campo: string;
  rotulo: string;
  origem: 'sistema' | 'formulario';
  // null = utilizável só como coluna, não aceita filtro (hoje: `id` e campos
  // de formulário tipo ARQUIVO — que nem aparecem aqui, ver acima).
  categoria: CondicaoTipoDado | null;
  operadoresPermitidos: OperadorDisponivel[] | null;
}

// Catálogo completo de campos disponíveis pra montar coluna/filtro de
// relatório neste processo: os reservados do sistema + formularioEntrada +
// formularioFase de todas as fases do processo (exceto ARQUIVO). `fases`
// deve vir ordenado por `ordem` — em caso de colisão de id entre
// formulários diferentes, a primeira ocorrência vence (formularioEntrada
// primeiro, depois cada fase na ordem do processo). Usado tanto pelo
// endpoint GET .../campos-disponiveis (o front usa isso pra montar o
// formulário de configuração do relatório) quanto pela validação de
// RelatorioModelo.colunas/filtros no service.
export function montarCatalogoCampos(
  processo: Processo,
  fases: Fase[] = [],
): CampoRelatorioDisponivel[] {
  const reservados: CampoRelatorioDisponivel[] =
    CAMPOS_RESERVADOS_RELATORIO.map((c) => ({
      campo: c.campo,
      rotulo: c.rotulo,
      origem: 'sistema',
      categoria: c.categoria,
      operadoresPermitidos: c.categoria
        ? operadoresDisponiveis(c.categoria)
        : null,
    }));

  const vistos = new Set<string>();
  const doFormulario: CampoRelatorioDisponivel[] = [];
  const todasDefinicoes: CampoFormulario[] = [
    ...processo.formularioEntrada,
    ...fases.flatMap((fase) => fase.formularioFase),
  ];
  for (const campo of todasDefinicoes) {
    if (campo.tipo === CampoFormularioTipo.ARQUIVO) continue;
    if (vistos.has(campo.id)) continue;
    vistos.add(campo.id);
    const categoria = categoriaPorTipoCampoFormulario(campo);
    doFormulario.push({
      campo: campo.id,
      rotulo: campo.rotulo,
      origem: 'formulario',
      categoria,
      operadoresPermitidos: categoria ? operadoresDisponiveis(categoria) : null,
    });
  }

  return [...reservados, ...doFormulario];
}

export function buscarCampoNoCatalogo(
  catalogo: CampoRelatorioDisponivel[],
  campo: string,
): CampoRelatorioDisponivel | undefined {
  return catalogo.find((c) => c.campo === campo);
}

export function ehCampoReservado(campo: string): boolean {
  return CAMPOS_RESERVADOS_POR_ID.has(campo);
}
