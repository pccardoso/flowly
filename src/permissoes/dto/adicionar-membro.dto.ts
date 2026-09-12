import { IsUUID } from 'class-validator';

export class AdicionarMembroDto {
  @IsUUID()
  usuarioId!: string;
}
