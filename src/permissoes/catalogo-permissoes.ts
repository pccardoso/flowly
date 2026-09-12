// Catálogo fixo de aliases (ver permissions.md, seção 4). Não é editável via
// API — é seedado no banco na subida da aplicação (ver PermissoesService.
// seedCatalogo). Pra adicionar um novo alias: acrescente aqui e use
// `@RequerPermissao('entidade.evento')` na rota correspondente.
export interface ItemCatalogoPermissao {
  alias: string;
  entidade: string;
  evento: string;
  descricao: string;
}

export const CATALOGO_PERMISSOES: ItemCatalogoPermissao[] = [
  { alias: 'processo.criar', entidade: 'processo', evento: 'criar', descricao: 'Criar um novo processo' },
  { alias: 'processo.editar', entidade: 'processo', evento: 'editar', descricao: 'Editar um processo existente (dados, formulário, imagem, conexões)' },
  { alias: 'processo.remover', entidade: 'processo', evento: 'remover', descricao: 'Remover um processo' },
  { alias: 'processo.visualizar', entidade: 'processo', evento: 'visualizar', descricao: 'Visualizar um processo, suas fases, automações e cards' },
  { alias: 'processo.aprovar', entidade: 'processo', evento: 'aprovar', descricao: 'Aprovar um processo (reservado — sem rota ainda)' },

  { alias: 'fase.criar', entidade: 'fase', evento: 'criar', descricao: 'Criar uma fase em um processo' },
  { alias: 'fase.editar', entidade: 'fase', evento: 'editar', descricao: 'Editar uma fase (nome, ordem, cor)' },
  { alias: 'fase.remover', entidade: 'fase', evento: 'remover', descricao: 'Remover uma fase (e os cards nela)' },

  { alias: 'transicao.criar', entidade: 'transicao', evento: 'criar', descricao: 'Criar uma transição entre fases' },
  { alias: 'transicao.editar', entidade: 'transicao', evento: 'editar', descricao: 'Editar uma transição existente' },
  { alias: 'transicao.remover', entidade: 'transicao', evento: 'remover', descricao: 'Remover uma transição' },

  { alias: 'automacao.criar', entidade: 'automacao', evento: 'criar', descricao: 'Criar uma automação' },
  { alias: 'automacao.editar', entidade: 'automacao', evento: 'editar', descricao: 'Editar uma automação' },
  { alias: 'automacao.remover', entidade: 'automacao', evento: 'remover', descricao: 'Remover uma automação' },
  { alias: 'automacao.visualizar', entidade: 'automacao', evento: 'visualizar', descricao: 'Listar automações de um processo' },
  { alias: 'automacao.executar', entidade: 'automacao', evento: 'executar', descricao: 'Disparo de automação (reservado — hoje só dispara sozinha por gatilho)' },

  { alias: 'card.criar', entidade: 'card', evento: 'criar', descricao: 'Criar um card (inclusive card filho)' },
  { alias: 'card.editar', entidade: 'card', evento: 'editar', descricao: 'Editar campos de um card e seus anexos' },
  { alias: 'card.remover', entidade: 'card', evento: 'remover', descricao: 'Remover um card' },
  { alias: 'card.visualizar', entidade: 'card', evento: 'visualizar', descricao: 'Visualizar cards de um processo' },
  { alias: 'card.mover', entidade: 'card', evento: 'mover', descricao: 'Mover um card entre fases' },

  { alias: 'comentario.criar', entidade: 'comentario', evento: 'criar', descricao: 'Comentar em um card' },
  { alias: 'comentario.editar', entidade: 'comentario', evento: 'editar', descricao: 'Editar um comentário (além da regra de só o autor poder editar o próprio)' },
  { alias: 'comentario.remover', entidade: 'comentario', evento: 'remover', descricao: 'Remover um comentário' },

  { alias: 'grupo.criar', entidade: 'grupo', evento: 'criar', descricao: 'Criar um grupo' },
  { alias: 'grupo.editar', entidade: 'grupo', evento: 'editar', descricao: 'Renomear um grupo' },
  { alias: 'grupo.remover', entidade: 'grupo', evento: 'remover', descricao: 'Remover um grupo' },
  { alias: 'grupo.gerenciar_membros', entidade: 'grupo', evento: 'gerenciar_membros', descricao: 'Adicionar/remover usuários de um grupo' },
  { alias: 'grupo.gerenciar_processos', entidade: 'grupo', evento: 'gerenciar_processos', descricao: 'Associar/desassociar processos a um grupo' },
  { alias: 'grupo.gerenciar_permissoes', entidade: 'grupo', evento: 'gerenciar_permissoes', descricao: 'Conceder/revogar permissões (organização ou por processo) de um grupo' },
];
