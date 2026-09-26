import {
  IsDateString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateCardDto {
  // Opcional se o processo tiver `tituloCampoId` configurado e o campo
  // correspondente vier preenchido em `campos` — nesse caso o título é
  // derivado automaticamente. Senão, é obrigatório.
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  titulo?: string;

  @IsUUID()
  processoId!: string;

  // Respostas do formulário de entrada do processo (ver
  // Processo.formularioEntrada). Ainda não validado contra a definição do
  // formulário — só é salvo como veio.
  @IsObject()
  @IsOptional()
  campos?: Record<string, unknown>;

  // Data/hora de vencimento em ISO 8601 (ex.: 2026-09-25T20:00:00Z).
  @IsOptional()
  @IsDateString()
  dataVencimento?: string;
}
