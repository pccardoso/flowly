import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateProcessoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @IsOptional()
  @IsHexColor()
  cor?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  // ids de campos do formularioEntrada a exibir na face do card.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  camposExibidosNoCard?: string[];

  // id de um campo do formularioEntrada cujo valor vira o título do card
  // quando a criação não manda `titulo`.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  tituloCampoId?: string;

  // Se o link externo de formulário (entrada ou, futuramente, de fase)
  // exige JWT válido pra visualizar/enviar. Ver FormulariosModule.
  @IsOptional()
  @IsBoolean()
  formularioExternoRequerAutenticacao?: boolean;
}
