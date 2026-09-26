import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Referencia steps pelo `apelido` (não pelo id) porque conexões e steps são
// enviados juntos na mesma request de criação/atualização da integração —
// os ids ainda não existem no momento em que o payload é montado no front.
export class CreateIntegracaoConexaoDto {
  @IsString()
  @IsNotEmpty()
  stepOrigemApelido!: string;

  @IsString()
  @IsNotEmpty()
  stepDestinoApelido!: string;

  // Obrigatório se (e só se) stepOrigemApelido apontar pra um step CONDICAO:
  // um dos ids de config.ramos daquele step, ou "senao" (ver
  // RAMO_CONDICAO_SENAO). Validado em IntegracoesService.validarGrafo.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ramoOrigem?: string;
}
