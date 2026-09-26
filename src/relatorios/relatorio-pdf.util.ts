import PDFDocument from 'pdfkit';
import { paraTextoExibicao } from './relatorio-formatacao.util';

// Grade simples (cabeçalho + linhas), sem lib de tabela — pdfkit não tem uma
// embutida. Paisagem A4 porque relatórios tendem a ter mais colunas do que
// cabe em retrato. Cabeçalho se repete a cada quebra de página.
export function construirPdf(
  titulo: string,
  colunas: { campo: string; rotulo: string }[],
  linhas: Record<string, unknown>[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      layout: 'landscape',
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const larguraUtil =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const larguraColuna = larguraUtil / colunas.length;
    const alturaLinha = 20;

    const desenharCabecalho = (y: number): void => {
      doc.font('Helvetica-Bold').fontSize(9);
      colunas.forEach((coluna, i) => {
        doc.text(coluna.rotulo, doc.page.margins.left + i * larguraColuna, y, {
          width: larguraColuna,
          ellipsis: true,
        });
      });
      doc
        .moveTo(doc.page.margins.left, y + 14)
        .lineTo(doc.page.width - doc.page.margins.right, y + 14)
        .strokeColor('#cccccc')
        .stroke();
      doc.font('Helvetica').fontSize(9);
    };

    doc.font('Helvetica-Bold').fontSize(16).text(titulo);
    doc.moveDown(0.3);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#666666')
      .text(
        `Gerado em ${new Date().toLocaleString('pt-BR')} — ${linhas.length} registro(s)`,
      )
      .fillColor('#000000');
    doc.moveDown(0.8);

    let y = doc.y;
    desenharCabecalho(y);
    y += alturaLinha;

    for (const linha of linhas) {
      if (y + alturaLinha > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        desenharCabecalho(y);
        y += alturaLinha;
      }
      colunas.forEach((coluna, i) => {
        const texto = paraTextoExibicao(linha[coluna.campo]);
        doc.text(texto, doc.page.margins.left + i * larguraColuna, y, {
          width: larguraColuna,
          ellipsis: true,
        });
      });
      y += alturaLinha;
    }

    doc.end();
  });
}
