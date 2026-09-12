import { IsOptional, IsUUID } from 'class-validator';

export class UpdateFaseTransicaoDto {
  @IsOptional()
  @IsUUID()
  faseOrigemId?: string;

  @IsOptional()
  @IsUUID()
  faseDestinoId?: string;
}
