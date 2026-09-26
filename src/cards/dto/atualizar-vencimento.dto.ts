import { IsDateString, ValidateIf } from 'class-validator';

// dataVencimento em ISO 8601 (ex.: 2026-09-25T20:00:00Z); null remove o
// vencimento do card. A chave precisa vir no corpo (undefined não é aceito).
export class AtualizarVencimentoDto {
  @ValidateIf((_, valor) => valor !== null)
  @IsDateString()
  dataVencimento!: string | null;
}
