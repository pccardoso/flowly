import { IsHexColor, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateProcessoDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsOptional()
  @IsHexColor()
  cor?: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}
