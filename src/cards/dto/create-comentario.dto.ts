import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateComentarioDto {
  @IsUUID()
  usuarioId!: string;

  @IsString()
  @IsNotEmpty()
  texto!: string;
}
