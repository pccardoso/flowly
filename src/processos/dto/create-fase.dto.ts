import {
  IsHexColor,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateFaseDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsInt()
  @Min(1)
  ordem!: number;

  @IsOptional()
  @IsHexColor()
  cor?: string;
}
