import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { StepTipo } from '../enums/step-tipo.enum';

export class CreateIntegracaoStepDto {
  // Único dentro da integração — é o nome usado pelas conexões e por
  // config.$stepRef de outros steps (ver create-integracao-conexao.dto.ts).
  @IsString()
  @IsNotEmpty()
  apelido!: string;

  @IsEnum(StepTipo)
  tipo!: StepTipo;

  // Formato validado em runtime conforme `tipo` (ver step-executors.ts).
  @IsObject()
  config!: Record<string, unknown>;

  // Obrigatório para todo step que não seja GATILHO_* (validado em
  // IntegracoesService.validarStep) — sem conta de serviço configurada, o
  // step não executa.
  @IsOptional()
  @IsUUID()
  usuarioServicoId?: string;

  @IsOptional()
  @IsNumber()
  posicaoX?: number;

  @IsOptional()
  @IsNumber()
  posicaoY?: number;
}
