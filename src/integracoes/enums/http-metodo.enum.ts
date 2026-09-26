export enum HttpMetodo {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}

// GET/DELETE não aceitam config.body (ver validarConfig do step HTTP_REQUEST
// em step-executors.ts) — não é RFC-inválido mandar corpo nesses métodos,
// mas é incomum o bastante pra virar fonte de confusão; melhor recusar cedo.
export const METODOS_SEM_BODY = new Set<HttpMetodo>([
  HttpMetodo.GET,
  HttpMetodo.DELETE,
]);
