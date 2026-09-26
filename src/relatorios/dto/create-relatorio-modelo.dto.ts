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

export class CreateRelatorioModeloDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ColunaRelatorioDto)
  colunas!: ColunaRelatorioDto[];

  // Todos combinados com E — ver RelatorioModelo.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FiltroRelatorioDto)
  filtros?: FiltroRelatorioDto[];
}
