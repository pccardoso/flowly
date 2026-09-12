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

export class CreateAutomacaoDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsEnum(GatilhoTipo)
  gatilhoTipo!: GatilhoTipo;

  // Formato validado em runtime conforme `gatilhoTipo` (ver AutomacoesService.validarGatilho).
  @IsObject()
  gatilhoConfig!: Record<string, unknown>;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateAutomacaoAcaoDto)
  acoes!: CreateAutomacaoAcaoDto[];
}
