import { StepTipo } from './enums/step-tipo.enum';

// Exemplos estáticos (não vêm do banco) de `config` e de `saida` de cada tipo
// de step, servidos junto do catálogo em GET .../integracoes/tipos-step pra o
// front renderizar o JSON direto, sem precisar rodar a integração só pra
// descobrir o formato. Valores são fictícios (uuids/nomes inventados).
//
// `exemploConfig` = o que vai em IntegracaoStep.config ao criar o step.
// `exemploSaida`  = o que os próximos steps enxergam via
//                   { "$stepRef": "<apelido>", "$campo": "<chave>" }.
//
// Tipado como Record<StepTipo, ...> de propósito: um StepTipo novo sem
// exemplo aqui não compila.
export interface ExemploStepTipo {
  exemploConfig: Record<string, unknown>;
  exemploSaida: Record<string, unknown>;
}

const FASE_ID = '3f2b8c1e-5a7d-4c39-9e0a-1b2c3d4e5f60';
const FASE_DESTINO_ID = '7a91d4b2-6c3e-4f18-8b5d-9e0f1a2b3c4d';
const CARD_ID = 'c1a2b3d4-e5f6-4789-a0b1-c2d3e4f5a6b7';
const CARD_PAI_ID = 'd9e8f7a6-b5c4-4d3e-8f2a-1b0c9d8e7f6a';
const CONEXAO_ID = '5e4d3c2b-1a09-4f8e-b7d6-c5b4a3928170';
const PROCESSO_ID = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const PROVEDOR_ID = '9c8b7a6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const ANEXO_ID = 'a7b6c5d4-e3f2-4a1b-8c9d-0e1f2a3b4c5d';
const MODELO_PDF_ID = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';
const ETIQUETA_ID = '8b7a6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d';
const USUARIO_ID = 'e2f1a0b9-c8d7-4e6f-a5b4-c3d2e1f0a9b8';

const CAMPOS_CARD = {
  nome: 'Maria Silva',
  email: 'maria@exemplo.com',
  valor: 1500,
};

export const EXEMPLOS_STEP_TIPOS: Record<StepTipo, ExemploStepTipo> = {
  [StepTipo.GATILHO_CARD_ENTROU_NA_FASE]: {
    exemploConfig: { faseId: FASE_ID },
    exemploSaida: {
      cardId: CARD_ID,
      titulo: 'Pedido da Maria Silva',
      campos: CAMPOS_CARD,
      faseId: FASE_ID,
    },
  },

  [StepTipo.GATILHO_CAMPO_ATUALIZADO]: {
    exemploConfig: { campo: 'valor' },
    exemploSaida: {
      cardId: CARD_ID,
      titulo: 'Pedido da Maria Silva',
      campos: CAMPOS_CARD,
      campo: 'valor',
      valorAtual: 1500,
    },
  },

  [StepTipo.GATILHO_CARD_CRIADO]: {
    exemploConfig: {},
    exemploSaida: {
      cardId: CARD_ID,
      titulo: 'Pedido da Maria Silva',
      campos: CAMPOS_CARD,
      faseId: FASE_ID,
      processoId: PROCESSO_ID,
      criadorId: USUARIO_ID,
      criadorNome: 'João Souza',
    },
  },

  [StepTipo.GATILHO_CARD_VENCIDO]: {
    exemploConfig: {},
    exemploSaida: {
      cardId: CARD_ID,
      titulo: 'Pedido 1042',
      campos: CAMPOS_CARD,
      faseId: FASE_ID,
      processoId: PROCESSO_ID,
      dataVencimento: '2026-09-25T20:00:00.000Z',
    },
  },

  [StepTipo.GATILHO_CARD_PRESTES_A_VENCER]: {
    exemploConfig: {},
    exemploSaida: {
      cardId: CARD_ID,
      titulo: 'Pedido 1042',
      campos: CAMPOS_CARD,
      faseId: FASE_ID,
      processoId: PROCESSO_ID,
      dataVencimento: '2026-09-25T20:00:00.000Z',
    },
  },

  [StepTipo.ACAO_ATUALIZAR_CAMPO]: {
    exemploConfig: { campo: 'status', valor: 'Aprovado' },
    exemploSaida: {
      campo: 'status',
      valorAntigo: 'Em análise',
      valorNovo: 'Aprovado',
    },
  },

  [StepTipo.ACAO_ATUALIZAR_CAMPOS_LOTE]: {
    exemploConfig: {
      tipoFormulario: 'FASE',
      valores: {
        status: 'Aprovado',
        observacao: 'Cliente {nome} validado',
        protocolo: { $stepRef: 'consulta_api', $campo: 'corpo' },
      },
    },
    exemploSaida: {
      cardId: CARD_ID,
      camposAtualizados: ['status', 'observacao', 'protocolo'],
    },
  },

  [StepTipo.ACAO_ATUALIZAR_TITULO]: {
    exemploConfig: { titulo: 'Pedido de {nome}' },
    exemploSaida: {
      tituloAntigo: 'Novo card',
      tituloNovo: 'Pedido de Maria Silva',
    },
  },

  [StepTipo.ACAO_CRIAR_CARD_FILHO]: {
    exemploConfig: { conexaoId: CONEXAO_ID, titulo: 'Entrega de {nome}' },
    exemploSaida: {
      criado: true,
      cardFilhoId: CARD_ID,
      titulo: 'Entrega de Maria Silva',
    },
  },

  [StepTipo.ACAO_MOVER_CARD_PAI]: {
    exemploConfig: { faseDestinoId: FASE_DESTINO_ID },
    exemploSaida: {
      movido: true,
      cardId: CARD_PAI_ID,
      faseDestinoId: FASE_DESTINO_ID,
    },
  },

  [StepTipo.ACAO_MOVER_CARD_FILHO]: {
    exemploConfig: { conexaoId: CONEXAO_ID, faseDestinoId: FASE_DESTINO_ID },
    exemploSaida: {
      movido: true,
      cardId: CARD_ID,
      faseDestinoId: FASE_DESTINO_ID,
    },
  },

  [StepTipo.ACAO_MOVER_CARD_ATUAL]: {
    exemploConfig: { faseDestinoId: FASE_DESTINO_ID },
    exemploSaida: {
      movido: true,
      cardId: CARD_ID,
      faseDestinoId: FASE_DESTINO_ID,
    },
  },

  [StepTipo.CONSULTA_CARD]: {
    exemploConfig: { cardId: { $stepRef: 'gatilho', $campo: 'cardId' } },
    exemploSaida: {
      cardId: CARD_ID,
      titulo: 'Pedido da Maria Silva',
      campos: CAMPOS_CARD,
      processoId: PROCESSO_ID,
      faseAtualId: FASE_ID,
      paiCardId: null,
      paiConexaoId: null,
      filhos: [null, CARD_PAI_ID],
      createdAt: '2026-09-19T14:30:00.000Z',
      updatedAt: '2026-09-19T15:10:00.000Z',
    },
  },

  [StepTipo.CONSULTA_FORMULARIO_CARD]: {
    exemploConfig: { cardId: { $stepRef: 'gatilho', $campo: 'cardId' } },
    exemploSaida: {
      cardId: CARD_ID,
      campos: [
        { id: 'nome', rotulo: 'Nome completo', valor: 'Maria Silva' },
        { id: 'email', rotulo: 'E-mail', valor: 'maria@exemplo.com' },
        { id: 'observacao', rotulo: 'Observação', valor: null },
      ],
    },
  },

  [StepTipo.CODIGO_JAVASCRIPT]: {
    exemploConfig: {
      codigo:
        'const total = entradas.valor * 1.1;\nreturn { total, nome: campos.nome };',
      valor: { $stepRef: 'gatilho', $campo: 'campos' },
    },
    // A saída é exatamente o objeto que o código retorna — este é só o
    // resultado do código de exemplo acima.
    exemploSaida: { total: 1650, nome: 'Maria Silva' },
  },

  [StepTipo.CONDICAO]: {
    exemploConfig: {
      atributo: '{valor}',
      tipoDado: 'INTEIRO',
      ramos: [{ id: 'alto', operador: 'MAIOR', valor: 1000 }],
    },
    exemploSaida: { ramoAtivo: 'alto', valorAvaliado: 1500 },
  },

  [StepTipo.REPETICAO]: {
    exemploConfig: { quantidade: 3, delayMs: 500 },
    exemploSaida: { quantidade: 3, delayMs: 500 },
  },

  [StepTipo.HTTP_REQUEST]: {
    exemploConfig: {
      url: 'https://api.exemplo.com/clientes/{nome}',
      metodo: 'POST',
      headers: { Authorization: 'Bearer meu-token' },
      body: {
        email: '{email}',
        valor: { $stepRef: 'gatilho', $campo: 'campos' },
      },
      timeoutMs: 10000,
    },
    exemploSaida: {
      statusCode: 200,
      sucesso: true,
      headers: { 'content-type': 'application/json' },
      corpo: { id: 42, status: 'criado' },
    },
  },

  [StepTipo.EMAIL]: {
    exemploConfig: {
      provedorId: PROVEDOR_ID,
      destinatarios: '{email}',
      cc: 'financeiro@exemplo.com',
      assunto: 'Pedido de {nome} aprovado',
      corpo: '<p>Olá {nome}, seu pedido foi aprovado.</p>',
      // Itens podem ser uuid literal ou $stepRef (aqui, o id que um step
      // "gerar_anexo" devolveu em `anexoId`).
      anexoIds: [ANEXO_ID, { $stepRef: 'gerar_anexo', $campo: 'anexoId' }],
    },
    // Só a confirmação de enfileiramento — o resultado real do envio fica em
    // GET /email-envios, depois que o worker processa.
    exemploSaida: { envioId: CARD_ID, status: 'PENDENTE' },
  },

  [StepTipo.NOTIFICACAO]: {
    exemploConfig: {
      tipo: 'SUCESSO',
      tamanho: 'M',
      formato: 'TEXTO',
      conteudo: 'Pedido de {nome} aprovado',
      // Opcional — id do catálogo GET /sons; omitido = alerta sem som.
      som: 'efeito-3',
    },
    // `conteudo` já vem interpolado (e sanitizado, se formato = HTML).
    exemploSaida: {
      tipo: 'SUCESSO',
      tamanho: 'M',
      formato: 'TEXTO',
      conteudo: 'Pedido de Maria Silva aprovado',
      som: 'efeito-3',
    },
  },

  [StepTipo.ACAO_ANEXAR_ARQUIVO]: {
    exemploConfig: {
      arquivos: [
        {
          objectKey: `integracoes/${PROCESSO_ID}/steps-arquivos/${ANEXO_ID}-termo-padrao.pdf`,
          nomeOriginal: 'termo-padrao.pdf',
          mimeType: 'application/pdf',
          tamanho: 48213,
        },
      ],
    },
    exemploSaida: { anexoIds: [ANEXO_ID], quantidade: 1 },
  },

  [StepTipo.ACAO_EMITIR_PDF]: {
    exemploConfig: { modeloId: MODELO_PDF_ID },
    // `anexoId` é o que um step EMAIL usa em config.anexoIds:
    // [{ "$stepRef": "<apelido>", "$campo": "anexoId" }].
    exemploSaida: {
      anexoId: ANEXO_ID,
      emissaoId: CARD_ID,
      nome: 'Contrato.pdf',
    },
  },

  [StepTipo.ACAO_APLICAR_ETIQUETA]: {
    exemploConfig: { etiquetaIds: [ETIQUETA_ID], modo: 'ADICIONAR' },
    // adicionadas = ids realmente novas no card; removidas = ids tiradas
    // (só no modo SUBSTITUIR); etiquetaIds = conjunto final do card.
    exemploSaida: {
      adicionadas: [ETIQUETA_ID],
      removidas: [],
      etiquetaIds: [ETIQUETA_ID],
    },
  },

  [StepTipo.ACAO_DEFINIR_VENCIMENTO]: {
    exemploConfig: { modo: 'RELATIVO', dias: 3, horas: 0 },
    exemploSaida: {
      dataVencimentoAnterior: null,
      dataVencimento: '2026-09-25T20:00:00.000Z',
    },
  },
};
