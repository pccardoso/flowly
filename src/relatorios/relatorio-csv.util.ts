import { paraTextoExibicao } from './relatorio-formatacao.util';

// `;` como separador (não `,`) porque campos MOEDA são exibidos com vírgula
// decimal (padrão pt-BR) — usar `,` como separador de coluna quebraria a
// abertura no Excel brasileiro. BOM UTF-8 no início pra acentuação abrir
// certo sem o usuário precisar escolher encoding manualmente.
function escaparCampoCsv(valor: unknown): string {
  const texto = paraTextoExibicao(valor);
  if (/["\n;]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export function construirCsv(
  colunas: { campo: string; rotulo: string }[],
  linhas: Record<string, unknown>[],
): string {
  const cabecalho = colunas.map((c) => escaparCampoCsv(c.rotulo)).join(';');
  const corpo = linhas
    .map((linha) =>
      colunas.map((c) => escaparCampoCsv(linha[c.campo])).join(';'),
    )
    .join('\r\n');
  return '﻿' + cabecalho + '\r\n' + corpo;
}
