import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

// Mesmo shape de CreateCardDto, mas sem processoId — aqui ele vem da rota
// (:processoId), nunca do body.
export class PreencherFormularioEntradaDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  titulo?: string;

  @IsObject()
  @IsOptional()
  campos?: Record<string, unknown>;
}
