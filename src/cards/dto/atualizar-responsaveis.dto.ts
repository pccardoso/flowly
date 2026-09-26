import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

// Substitui a lista inteira de responsáveis do card (mesmo padrão de
// DefinirFormularioEntradaDto: PUT que troca tudo de uma vez, não incremento
// por item) — array vazio é válido e significa "remover todos os
// responsáveis".
export class AtualizarResponsaveisDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  usuarioIds!: string[];
}
