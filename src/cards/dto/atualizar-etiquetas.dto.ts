import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

// Substitui a lista inteira de etiquetas do card (mesmo padrão de
// AtualizarResponsaveisDto) — array vazio remove todas.
export class AtualizarEtiquetasDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  etiquetaIds!: string[];
}
