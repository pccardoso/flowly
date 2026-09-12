import { IsUUID } from 'class-validator';

export class RemoverComentarioDto {
  @IsUUID()
  usuarioId!: string;
}
