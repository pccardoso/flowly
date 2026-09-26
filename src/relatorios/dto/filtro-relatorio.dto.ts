import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CondicaoOperador } from '../../common/enums/condicao.enum';

// `valor`/`valorFinal` só levam @IsOptional() (sem checagem de tipo) — o
// formato esperado depende da categoria do `campo` (INTEIRO/BOOLEAN/STRING/
// DATA), só conhecida em runtime (ver relatorio-campo.util.ts);
// RelatoriosService valida isso contra o catálogo do processo, não o
// class-validator. @IsOptional() aqui não é só "campo opcional": sem NENHUM
// decorator, o ValidationPipe global (whitelist: true, ver main.ts) apaga a
// propriedade inteira do payload antes de chegar no service.
export class FiltroRelatorioDto {
  @IsString()
  @IsNotEmpty()
  campo!: string;

  @IsEnum(CondicaoOperador)
  operador!: CondicaoOperador;

  @IsOptional()
  valor?: unknown;

  @IsOptional()
  valorFinal?: unknown;
}
