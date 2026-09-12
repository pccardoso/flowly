import { IsNotEmptyObject, IsObject } from 'class-validator';

export class UpdateCardCamposDto {
  // Merge parcial em `card.campos` (mesma semântica da ação ATUALIZAR_CAMPO):
  // só as chaves enviadas são sobrescritas, o resto do objeto é preservado.
  @IsObject()
  @IsNotEmptyObject()
  campos!: Record<string, unknown>;
}
