// Formata o valor de uma célula (já resolvido por valorExibicaoDoCard em
// relatorios.service.ts) pra texto simples, usado tanto no CSV quanto no PDF.
export function paraTextoExibicao(valor: unknown): string {
  if (valor === null || valor === undefined) {
    return '';
  }
  if (typeof valor === 'string') {
    return valor;
  }
  if (typeof valor === 'number' || typeof valor === 'boolean') {
    return String(valor);
  }
  // Caso raro: um campo jsonb guardando um objeto/array bruto em vez de um
  // escalar — melhor exibir o JSON do que "[object Object]".
  return JSON.stringify(valor);
}
