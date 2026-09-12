import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCardFilhoDto {
  // Se omitido, o card filho herda o título do card pai.
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  titulo?: string;
}
