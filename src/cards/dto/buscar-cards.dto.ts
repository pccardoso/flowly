import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FiltroOperador } from '../busca/card-filtro.enum';
import { MAX_FILTROS } from '../busca/card-filtro.util';

// `valor`/`valorFinal` só levam @IsOptional() (sem checagem de tipo): o
// formato depende do tipo do `campo`, só conhecido em runtime — a validação
// real está em card-filtro.util.ts (validarFiltro). Sem NENHUM decorator o
// ValidationPipe global (whitelist: true) apagaria a propriedade.
export class FiltroCardDto {
  @IsString()
  @IsNotEmpty()
  campo!: string;

  @IsEnum(FiltroOperador)
  operador!: FiltroOperador;

  @IsOptional()
  valor?: unknown;

  @IsOptional()
  valorFinal?: unknown;
}

export class BuscarCardsDto {
  @IsUUID()
  processoId!: string;

  // Busca livre (estilo LIKE) em título, campos, etiquetas e responsáveis.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  busca?: string;

  // Todos os filtros são combinados com E.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FILTROS)
  @ValidateNested({ each: true })
  @Type(() => FiltroCardDto)
  filtros?: FiltroCardDto[];

  // Fuso IANA usado pra transformar createdAt/updatedAt/dataVencimento em
  // "dia" nos filtros de data. Padrão: America/Sao_Paulo.
  @IsOptional()
  @IsString()
  fusoHorario?: string;
}

export class BuscarCardsPaginadoDto extends BuscarCardsDto {
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
