import { Etiqueta } from './entities/etiqueta.entity';

// Formato enxuto de etiqueta usado dentro do payload do card (listagem,
// detalhe e evento `card:atualizado`).
export interface EtiquetaResumo {
  id: string;
  nome: string;
  cor: string;
}

export function paraEtiquetaResumo(etiqueta: Etiqueta): EtiquetaResumo {
  return { id: etiqueta.id, nome: etiqueta.nome, cor: etiqueta.cor };
}
