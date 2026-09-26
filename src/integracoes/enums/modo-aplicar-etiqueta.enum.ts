// Como o step ACAO_APLICAR_ETIQUETA combina as etiquetas configuradas com as
// que o card já tem.
export enum ModoAplicarEtiqueta {
  // Mantém as etiquetas atuais e acrescenta as do step (as que o card já tem
  // não são tocadas nem duplicadas).
  ADICIONAR = 'ADICIONAR',
  // Limpa todas as etiquetas do card e deixa só as do step.
  SUBSTITUIR = 'SUBSTITUIR',
}
