export interface PaginaMeta {
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
  from: number | null;
  to: number | null;
}

export interface PaginaResultado<T> {
  data: T[];
  meta: PaginaMeta;
}

// Monta a resposta no formato { data, meta }, no estilo do paginate() do
// Laravel: a primeira página já informa `lastPage`/`total`, então o front
// sabe quantas páginas existem sem precisar buscar todas antes.
export function montarPagina<T>(
  data: T[],
  total: number,
  page: number,
  perPage: number,
): PaginaResultado<T> {
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? null : (page - 1) * perPage + 1;
  const to = from === null ? null : from + data.length - 1;

  return {
    data,
    meta: { total, perPage, currentPage: page, lastPage, from, to },
  };
}
