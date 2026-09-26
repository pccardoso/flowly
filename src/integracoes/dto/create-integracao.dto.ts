import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreateIntegracaoStepDto } from './create-integracao-step.dto';
import { CreateIntegracaoConexaoDto } from './create-integracao-conexao.dto';

export class CreateIntegracaoDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateIntegracaoStepDto)
  steps!: CreateIntegracaoStepDto[];

  // Pode ser vazio (integração de um único step de gatilho, sem ações).
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateIntegracaoConexaoDto)
  conexoes!: CreateIntegracaoConexaoDto[];
}
