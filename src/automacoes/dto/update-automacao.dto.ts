import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { GatilhoTipo } from '../enums/gatilho-tipo.enum';
import { CreateAutomacaoAcaoDto } from './create-automacao-acao.dto';

export class UpdateAutomacaoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsEnum(GatilhoTipo)
  gatilhoTipo?: GatilhoTipo;

  // Formato validado em runtime conforme `gatilhoTipo` (final, após merge com
  // o valor atual quando só um dos dois for enviado).
  @IsOptional()
  @IsObject()
  gatilhoConfig?: Record<string, unknown>;

  // Quando enviado, substitui a lista de ações inteira (mesmo padrão de
  // DefinirFormularioEntradaDto: edita tudo de uma vez, não dá pra alterar
  // uma ação isolada).
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateAutomacaoAcaoDto)
  acoes?: CreateAutomacaoAcaoDto[];
}
