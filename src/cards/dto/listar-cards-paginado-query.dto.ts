import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { VencimentoFiltro } from '../vencimento.util';

export class ListarCardsPaginadoQueryDto {
  @IsUUID()
  processoId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage: number = 20;

  // Filtra pelo estado do vencimento (calculado na hora da consulta).
  @IsOptional()
  @IsEnum(VencimentoFiltro)
  vencimento?: VencimentoFiltro;
}
