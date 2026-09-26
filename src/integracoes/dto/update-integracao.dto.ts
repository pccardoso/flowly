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

// PATCH parcial: `nome`/`ativo` só sobrescrevem quando enviados. `steps` e
// `conexoes`, quando enviados, substituem o grafo inteiro (mesmo padrão de
// UpdateAutomacaoDto.acoes) — sempre os dois juntos, nunca só um dos dois,
// porque conexões dependem dos apelidos dos steps.
export class UpdateIntegracaoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateIntegracaoStepDto)
  steps?: CreateIntegracaoStepDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateIntegracaoConexaoDto)
  conexoes?: CreateIntegracaoConexaoDto[];
}
