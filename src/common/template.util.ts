const PLACEHOLDER_REGEX = /\{([^{}]+)\}/g;

// Substitui cada `{chave}` pelo valor correspondente em `campos` (os campos
// livres do card). Chave ausente ou com valor null/undefined vira string
// vazia — nunca lança erro, pois o texto pode ser digitado livremente no
// front antes de o campo existir no card.
export function interpolarTemplate(
  template: string,
  campos: Record<string, unknown>,
): string {
  return template.replace(PLACEHOLDER_REGEX, (_match, chave: string) => {
    const valor = campos[chave.trim()];
    return valor === undefined || valor === null ? '' : String(valor);
  });
}
