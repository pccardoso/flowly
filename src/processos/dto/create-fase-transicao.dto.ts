import { IsUUID } from 'class-validator';

export class CreateFaseTransicaoDto {
  @IsUUID()
  faseOrigemId!: string;

  @IsUUID()
  faseDestinoId!: string;
}
