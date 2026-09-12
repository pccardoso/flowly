import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CampoFormularioDto } from './campo-formulario.dto';

export class DefinirFormularioEntradaDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampoFormularioDto)
  campos!: CampoFormularioDto[];
}
