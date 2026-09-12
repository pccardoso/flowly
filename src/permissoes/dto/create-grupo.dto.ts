import { IsNotEmpty, IsString } from 'class-validator';

export class CreateGrupoDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;
}
