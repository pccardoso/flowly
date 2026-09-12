import { IsEnum, IsInt, IsObject, Min } from 'class-validator';
import { AcaoTipo } from '../enums/acao-tipo.enum';

export class CreateAutomacaoAcaoDto {
  @IsEnum(AcaoTipo)
  tipo!: AcaoTipo;

  // Formato validado em runtime conforme `tipo` (ver AutomacoesService.validarAcao).
  @IsObject()
  config!: Record<string, unknown>;

  @IsInt()
  @Min(1)
  ordem!: number;
}
