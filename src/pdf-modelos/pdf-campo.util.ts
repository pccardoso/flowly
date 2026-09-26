import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { CampoFormulario } from '../processos/formulario/campo-formulario.interface';
import { CampoFormularioTipo } from '../processos/formulario/campo-formulario-tipo.enum';

export interface PlaceholderPdfDisponivel {
  placeholder: string;
  rotulo: string;
  origem: 'sistema' | 'formulario';
}

const PLACEHOLDERS_SISTEMA: { chave: string; rotulo: string }[] = [
  { chave: 'card.id', rotulo: 'ID do card' },
  { chave: 'card.titulo', rotulo: 'Título' },
  { chave: 'card.fase', rotulo: 'Fase atual' },
  { chave: 'card.processo', rotulo: 'Nome do processo' },
  { chave: 'card.criadoEm', rotulo: 'Criado em' },
  { chave: 'card.atualizadoEm', rotulo: 'Atualizado em' },
];

// Catálogo de placeholders disponíveis pra montar um modelo de PDF neste
// processo: atributos de sistema do card + formularioEntrada + formularioFase
// de todas as fases do processo (mesmo filtro do relatório: ARQUIVO fora,
// porque o valor não fica em card.campos — upload vira CardAnexo, sem
// ligação de volta com o id do campo). `fases` deve vir ordenado por
// `ordem` — em caso de colisão de id entre formulários diferentes, a
// primeira ocorrência vence (formularioEntrada primeiro, depois cada fase
// na ordem do processo). Usado pelo endpoint GET .../campos-disponiveis pro
// front montar o dropdown "inserir campo" do editor de modelo.
export function montarCatalogoPlaceholdersPdf(
  processo: Processo,
  fases: Fase[] = [],
): PlaceholderPdfDisponivel[] {
  const sistema: PlaceholderPdfDisponivel[] = PLACEHOLDERS_SISTEMA.map((p) => ({
    placeholder: `{${p.chave}}`,
    rotulo: p.rotulo,
    origem: 'sistema',
  }));

  const vistos = new Set<string>();
  const doFormulario: PlaceholderPdfDisponivel[] = [];
  const todasDefinicoes: CampoFormulario[] = [
    ...processo.formularioEntrada,
    ...fases.flatMap((fase) => fase.formularioFase),
  ];
  for (const campo of todasDefinicoes) {
    if (campo.tipo === CampoFormularioTipo.ARQUIVO) continue;
    if (vistos.has(campo.id)) continue;
    vistos.add(campo.id);
    doFormulario.push({
      placeholder: `{campos.${campo.id}}`,
      rotulo: campo.rotulo,
      origem: 'formulario',
    });
  }

  return [...sistema, ...doFormulario];
}
