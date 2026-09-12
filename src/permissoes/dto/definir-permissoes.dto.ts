import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class DefinirPermissoesDto {
  // Substitui a lista inteira (PUT) — mandar [] remove todas.
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  aliases!: string[];
}
