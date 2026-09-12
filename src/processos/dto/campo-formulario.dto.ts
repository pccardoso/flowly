import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { CampoFormularioTipo } from '../formulario/campo-formulario-tipo.enum';

export class CampoFormularioDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'id deve conter apenas letras, números e underscore',
  })
  id!: string;

  @IsString()
  @IsNotEmpty()
  rotulo!: string;

  @IsEnum(CampoFormularioTipo)
  tipo!: CampoFormularioTipo;

  @IsBoolean()
  obrigatorio!: boolean;

  @IsInt()
  @Min(1)
  ordem!: number;

  @IsOptional()
  @IsString()
  mascara?: string;

  // Obrigatório (array não-vazio) para SELECAO/RADIO. Pra CHECKBOX é
  // opcional — quando informado valida igual, quando ausente o campo vira
  // um checkbox booleano único.
  @ValidateIf(
    (campo: CampoFormularioDto) =>
      campo.opcoes !== undefined ||
      campo.tipo === CampoFormularioTipo.SELECAO ||
      campo.tipo === CampoFormularioTipo.RADIO,
  )
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  opcoes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tiposArquivoPermitidos?: string[];
}
