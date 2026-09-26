import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ColunaRelatorioDto } from './coluna-relatorio.dto';
import { FiltroRelatorioDto } from './filtro-relatorio.dto';

// Roda a mesma engine de RelatorioModelo, mas com uma especificação
// avulsa — o front chama isso enquanto o usuário ainda está montando o
// relatório na tela, antes de decidir salvar como modelo.
export class PreVisualizarRelatorioDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ColunaRelatorioDto)
  colunas!: ColunaRelatorioDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FiltroRelatorioDto)
  filtros?: FiltroRelatorioDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number = 20;
}
