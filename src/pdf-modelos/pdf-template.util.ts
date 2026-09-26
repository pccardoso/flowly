import { Card } from '../cards/entities/card.entity';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';

const PLACEHOLDER_REGEX = /\{([^{}]+)\}/g;

// Diferente de common/template.util.ts (usado por automações, contrato
// {chave} plano contra card.campos — não pode mudar, outras coisas dependem
// dele): aqui o público é o usuário final montando um modelo de PDF num
// editor, então o namespace é estruturado ({card.titulo}, {campos.chave}) pra
// caber num dropdown "inserir campo" organizado por origem (ver
// pdf-campo.util.ts) e não colidir com um campo do formulário chamado
// "titulo".
function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function valorParaTexto(valor: unknown): string {
  if (valor === undefined || valor === null) return '';
  if (valor instanceof Date) return valor.toISOString();
  if (Array.isArray(valor)) return valor.map((item) => String(item)).join(', ');
  switch (typeof valor) {
    case 'string':
      return valor;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(valor);
    default:
      return JSON.stringify(valor);
  }
}

function resolverCaminho(
  contexto: Record<string, unknown>,
  caminho: string,
): unknown {
  return caminho.split('.').reduce<unknown>((atual, chave) => {
    if (atual && typeof atual === 'object') {
      return (atual as Record<string, unknown>)[chave];
    }
    return undefined;
  }, contexto);
}

// Cada valor interpolado é escapado pra HTML — o autor do modelo é confiável
// (precisa de pdfModelo.criar/editar), mas o VALOR pode vir de
// card.campos preenchido via formulário externo público sem login
// (FormulariosController). Sem isso, um valor como `<script>` quebraria a
// estrutura do modelo ou injetaria marcação nova no PDF gerado.
export function interpolarTemplatePdf(
  template: string,
  contexto: Record<string, unknown>,
): string {
  return template.replace(PLACEHOLDER_REGEX, (_match, caminhoBruto: string) => {
    const valor = resolverCaminho(contexto, caminhoBruto.trim());
    return escaparHtml(valorParaTexto(valor));
  });
}

export function montarContextoPdf(
  card: Card,
  processo: Processo,
  fase: Fase,
): Record<string, unknown> {
  return {
    card: {
      id: card.id,
      titulo: card.titulo,
      fase: fase.nome,
      processo: processo.nome,
      criadoEm: card.createdAt,
      atualizadoEm: card.updatedAt,
    },
    // Cobre hoje o formulário de entrada (cujas respostas já caem em
    // card.campos na criação) e, quando o formulário de fase existir, deve
    // continuar funcionando sem mudança nenhuma aqui — desde que ele também
    // grave em card.campos (ver CLAUDE.md/conversa).
    campos: card.campos,
  };
}
