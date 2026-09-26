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
  {
    alias: 'processo.criar',
    entidade: 'processo',
    evento: 'criar',
    descricao: 'Criar um novo processo',
  },
  {
    alias: 'processo.editar',
    entidade: 'processo',
    evento: 'editar',
    descricao:
      'Editar um processo existente (dados, formulário, imagem, conexões)',
  },
  {
    alias: 'processo.remover',
    entidade: 'processo',
    evento: 'remover',
    descricao: 'Remover um processo',
  },
  {
    alias: 'processo.visualizar',
    entidade: 'processo',
    evento: 'visualizar',
    descricao: 'Visualizar um processo, suas fases, automações e cards',
  },
  {
    alias: 'processo.aprovar',
    entidade: 'processo',
    evento: 'aprovar',
    descricao: 'Aprovar um processo (reservado — sem rota ainda)',
  },

  {
    alias: 'fase.criar',
    entidade: 'fase',
    evento: 'criar',
    descricao: 'Criar uma fase em um processo',
  },
  {
    alias: 'fase.editar',
    entidade: 'fase',
    evento: 'editar',
    descricao: 'Editar uma fase (nome, ordem, cor)',
  },
  {
    alias: 'fase.remover',
    entidade: 'fase',
    evento: 'remover',
    descricao: 'Remover uma fase (e os cards nela)',
  },

  {
    alias: 'transicao.criar',
    entidade: 'transicao',
    evento: 'criar',
    descricao: 'Criar uma transição entre fases',
  },
  {
    alias: 'transicao.editar',
    entidade: 'transicao',
    evento: 'editar',
    descricao: 'Editar uma transição existente',
  },
  {
    alias: 'transicao.remover',
    entidade: 'transicao',
    evento: 'remover',
    descricao: 'Remover uma transição',
  },

  {
    alias: 'automacao.criar',
    entidade: 'automacao',
    evento: 'criar',
    descricao: 'Criar uma automação',
  },
  {
    alias: 'automacao.editar',
    entidade: 'automacao',
    evento: 'editar',
    descricao: 'Editar uma automação',
  },
  {
    alias: 'automacao.remover',
    entidade: 'automacao',
    evento: 'remover',
    descricao: 'Remover uma automação',
  },
  {
    alias: 'automacao.visualizar',
    entidade: 'automacao',
    evento: 'visualizar',
    descricao: 'Listar automações de um processo',
  },
  {
    alias: 'automacao.executar',
    entidade: 'automacao',
    evento: 'executar',
    descricao:
      'Disparo de automação (reservado — hoje só dispara sozinha por gatilho)',
  },

  {
    alias: 'integracao.criar',
    entidade: 'integracao',
    evento: 'criar',
    descricao: 'Criar uma integração (grafo de steps)',
  },
  {
    alias: 'integracao.editar',
    entidade: 'integracao',
    evento: 'editar',
    descricao: 'Editar uma integração',
  },
  {
    alias: 'integracao.remover',
    entidade: 'integracao',
    evento: 'remover',
    descricao: 'Remover uma integração',
  },
  {
    alias: 'integracao.visualizar',
    entidade: 'integracao',
    evento: 'visualizar',
    descricao: 'Listar integrações de um processo e suas execuções',
  },
  {
    alias: 'integracao.executar_codigo',
    entidade: 'integracao',
    evento: 'executar_codigo',
    descricao:
      'Conta de serviço de um step CODIGO_JAVASCRIPT (roda código sandboxado)',
  },
  {
    alias: 'integracao.avaliar_condicao',
    entidade: 'integracao',
    evento: 'avaliar_condicao',
    descricao:
      'Conta de serviço de um step CONDICAO (avalia regras e escolhe o ramo)',
  },
  {
    alias: 'integracao.executar_http',
    entidade: 'integracao',
    evento: 'executar_http',
    descricao:
      'Conta de serviço de um step HTTP_REQUEST (chama uma URL externa)',
  },
  {
    alias: 'integracao.repetir',
    entidade: 'integracao',
    evento: 'repetir',
    descricao:
      'Conta de serviço de um step REPETICAO (repete seu corpo N vezes)',
  },
  {
    alias: 'integracao.enviar_email',
    entidade: 'integracao',
    evento: 'enviar_email',
    descricao:
      'Conta de serviço de um step EMAIL (enfileira um envio de email)',
  },
  {
    alias: 'integracao.emitir_notificacao',
    entidade: 'integracao',
    evento: 'emitir_notificacao',
    descricao:
      'Conta de serviço de um step NOTIFICACAO (emite um alerta em tempo real pro processo)',
  },
  {
    alias: 'integracao.anexar_arquivo',
    entidade: 'integracao',
    evento: 'anexar_arquivo',
    descricao:
      'Conta de serviço de um step ACAO_ANEXAR_ARQUIVO (anexa arquivo(s) fixos no card)',
  },

  {
    alias: 'provedorEmail.criar',
    entidade: 'provedorEmail',
    evento: 'criar',
    descricao: 'Criar um provedor de email (organização)',
  },
  {
    alias: 'provedorEmail.editar',
    entidade: 'provedorEmail',
    evento: 'editar',
    descricao: 'Editar um provedor de email',
  },
  {
    alias: 'provedorEmail.remover',
    entidade: 'provedorEmail',
    evento: 'remover',
    descricao: 'Remover um provedor de email',
  },
  {
    alias: 'provedorEmail.visualizar',
    entidade: 'provedorEmail',
    evento: 'visualizar',
    descricao: 'Listar provedores de email e o histórico de envios',
  },

  {
    alias: 'relatorio.criar',
    entidade: 'relatorio',
    evento: 'criar',
    descricao: 'Criar um modelo de relatório em um processo',
  },
  {
    alias: 'relatorio.editar',
    entidade: 'relatorio',
    evento: 'editar',
    descricao: 'Editar um modelo de relatório',
  },
  {
    alias: 'relatorio.remover',
    entidade: 'relatorio',
    evento: 'remover',
    descricao: 'Remover um modelo de relatório',
  },
  {
    alias: 'relatorio.visualizar',
    entidade: 'relatorio',
    evento: 'visualizar',
    descricao:
      'Listar modelos de relatório, ver o catálogo de campos e pré-visualizar/rodar os dados',
  },
  {
    alias: 'relatorio.emitir',
    entidade: 'relatorio',
    evento: 'emitir',
    descricao: 'Exportar um relatório em PDF/CSV',
  },

  {
    alias: 'etiqueta.criar',
    entidade: 'etiqueta',
    evento: 'criar',
    descricao: 'Criar uma etiqueta em um processo',
  },
  {
    alias: 'etiqueta.editar',
    entidade: 'etiqueta',
    evento: 'editar',
    descricao: 'Editar nome/cor de uma etiqueta',
  },
  {
    alias: 'etiqueta.remover',
    entidade: 'etiqueta',
    evento: 'remover',
    descricao: 'Remover uma etiqueta (sai de todos os cards)',
  },
  {
    alias: 'etiqueta.visualizar',
    entidade: 'etiqueta',
    evento: 'visualizar',
    descricao: 'Listar as etiquetas de um processo',
  },
  {
    alias: 'pdfModelo.criar',
    entidade: 'pdfModelo',
    evento: 'criar',
    descricao: 'Criar um modelo de PDF (HTML/CSS) em um processo',
  },
  {
    alias: 'pdfModelo.editar',
    entidade: 'pdfModelo',
    evento: 'editar',
    descricao: 'Editar um modelo de PDF',
  },
  {
    alias: 'pdfModelo.remover',
    entidade: 'pdfModelo',
    evento: 'remover',
    descricao: 'Remover um modelo de PDF',
  },
  {
    alias: 'pdfModelo.visualizar',
    entidade: 'pdfModelo',
    evento: 'visualizar',
    descricao:
      'Listar modelos de PDF, ver o catálogo de placeholders e pré-visualizar',
  },
  {
    alias: 'pdfModelo.emitir',
    entidade: 'pdfModelo',
    evento: 'emitir',
    descricao: 'Emitir (exportar) um PDF de um card a partir de um modelo',
  },

  {
    alias: 'card.criar',
    entidade: 'card',
    evento: 'criar',
    descricao: 'Criar um card (inclusive card filho)',
  },
  {
    alias: 'card.editar',
    entidade: 'card',
    evento: 'editar',
    descricao: 'Editar campos de um card e seus anexos',
  },
  {
    alias: 'card.remover',
    entidade: 'card',
    evento: 'remover',
    descricao: 'Remover um card',
  },
  {
    alias: 'card.visualizar',
    entidade: 'card',
    evento: 'visualizar',
    descricao: 'Visualizar cards de um processo',
  },
  {
    alias: 'card.mover',
    entidade: 'card',
    evento: 'mover',
    descricao: 'Mover um card entre fases',
  },

  {
    alias: 'comentario.criar',
    entidade: 'comentario',
    evento: 'criar',
    descricao: 'Comentar em um card',
  },
  {
    alias: 'comentario.editar',
    entidade: 'comentario',
    evento: 'editar',
    descricao:
      'Editar um comentário (além da regra de só o autor poder editar o próprio)',
  },
  {
    alias: 'comentario.remover',
    entidade: 'comentario',
    evento: 'remover',
    descricao: 'Remover um comentário',
  },

  {
    alias: 'grupo.criar',
    entidade: 'grupo',
    evento: 'criar',
    descricao: 'Criar um grupo',
  },
  {
    alias: 'grupo.editar',
    entidade: 'grupo',
    evento: 'editar',
    descricao: 'Renomear um grupo',
  },
  {
    alias: 'grupo.remover',
    entidade: 'grupo',
    evento: 'remover',
    descricao: 'Remover um grupo',
  },
  {
    alias: 'grupo.gerenciar_membros',
    entidade: 'grupo',
    evento: 'gerenciar_membros',
    descricao: 'Adicionar/remover usuários de um grupo',
  },
  {
    alias: 'grupo.gerenciar_processos',
    entidade: 'grupo',
    evento: 'gerenciar_processos',
    descricao: 'Associar/desassociar processos a um grupo',
  },
  {
    alias: 'grupo.gerenciar_permissoes',
    entidade: 'grupo',
    evento: 'gerenciar_permissoes',
    descricao:
      'Conceder/revogar permissões (organização ou por processo) de um grupo',
  },

  {
    alias: 'usuario.criar',
    entidade: 'usuario',
    evento: 'criar',
    descricao: 'Criar um novo usuário (cadastro não é mais público)',
  },
  {
    alias: 'usuario.editar',
    entidade: 'usuario',
    evento: 'editar',
    descricao: 'Editar nome/email/senha de um usuário',
  },
  {
    alias: 'usuario.bloquear',
    entidade: 'usuario',
    evento: 'bloquear',
    descricao:
      'Bloquear ou desbloquear um usuário (não existe remoção — só bloqueio)',
  },
  {
    alias: 'usuario.visualizar',
    entidade: 'usuario',
    evento: 'visualizar',
    descricao:
      'Ver a listagem completa de usuários (inclusive bloqueados) e o detalhe de cada um',
  },
];
