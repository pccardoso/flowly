import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ColunaRelatorioDto } from './coluna-relatorio.dto';
import { FiltroRelatorioDto } from './filtro-relatorio.dto';

// PATCH parcial: nome/colunas/filtros só sobrescrevem quando enviados —
// diferente de UpdateIntegracaoDto, aqui não há regra de "sempre juntos"
// porque colunas e filtros são independentes entre si (filtrar por um campo
// não exige mostrá-lo como coluna).
export class UpdateRelatorioModeloDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ColunaRelatorioDto)
  colunas?: ColunaRelatorioDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FiltroRelatorioDto)
  filtros?: FiltroRelatorioDto[];
}
