import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CardEventoTipo } from '../enums/card-evento-tipo.enum';

export class ListarHistoricoQueryDto {
  // Filtra pra um único tipo (ex.: ?tipo=CARD_MOVIDO pra ver só as
  // movimentações de fase que o card sofreu).
  @IsOptional()
  @IsEnum(CardEventoTipo)
  tipo?: CardEventoTipo;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage: number = 20;
}
