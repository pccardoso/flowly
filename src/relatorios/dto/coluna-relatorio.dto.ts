import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ColunaRelatorioDto {
  @IsString()
  @IsNotEmpty()
  campo!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  rotulo?: string;
}
