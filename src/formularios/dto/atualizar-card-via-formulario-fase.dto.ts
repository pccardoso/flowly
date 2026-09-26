import { IsNotEmptyObject, IsObject } from 'class-validator';

// Mesmo shape/semântica de UpdateCardCamposDto (merge parcial em
// card.campos) — DTO próprio só pra manter o módulo de formulários
// desacoplado de src/cards/dto no nível de import.
export class AtualizarCardViaFormularioFaseDto {
  @IsObject()
  @IsNotEmptyObject()
  campos!: Record<string, unknown>;
}
