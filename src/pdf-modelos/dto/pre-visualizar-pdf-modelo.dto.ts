import { IsUUID } from 'class-validator';

// Pré-visualização usa dados reais de um card já existente do processo (o
// editor não tem um card "de mentira" pra oferecer) — renderiza na hora,
// síncrono, sem persistir nada nem gravar histórico (ver
// PdfModelosService.preVisualizar).
export class PreVisualizarPdfModeloDto {
  @IsUUID()
  cardId!: string;
}
