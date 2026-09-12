import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateGrupoDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;
}
