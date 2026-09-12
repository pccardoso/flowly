import { IsUUID } from 'class-validator';

export class CreateProcessoConexaoDto {
  @IsUUID()
  processoDestinoId!: string;
}
