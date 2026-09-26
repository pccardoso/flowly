// Novos tipos de step entram aqui + uma entrada no registry
// (step-executors.ts) com validarConfig/executar — sem editar switch nenhum.
// GATILHO_* são sempre a raiz do grafo (sem entrada, disparam a execução).
// GATILHO_CARD_CRIADO é o único gatilho que existe SÓ no motor de
// Integracao — não tem equivalente em Automacao (ver
// cards/gatilho-dispatch.helper.ts: dispararGatilhoIntegracaoCardCriado
// chama só integracoesService, nunca automacoesService).
export enum StepTipo {
  GATILHO_CARD_ENTROU_NA_FASE = 'GATILHO_CARD_ENTROU_NA_FASE',
  GATILHO_CAMPO_ATUALIZADO = 'GATILHO_CAMPO_ATUALIZADO',
  GATILHO_CARD_CRIADO = 'GATILHO_CARD_CRIADO',
  // Disparados pela varredura periódica (src/vencimentos), só no motor de
  // Integracao, sem config: valem pra todo card do processo com
  // dataVencimento. Cada um dispara UMA vez por (card, data de vencimento).
  GATILHO_CARD_VENCIDO = 'GATILHO_CARD_VENCIDO',
  GATILHO_CARD_PRESTES_A_VENCER = 'GATILHO_CARD_PRESTES_A_VENCER',
  ACAO_ATUALIZAR_CAMPO = 'ACAO_ATUALIZAR_CAMPO',
  // Igual a ACAO_ATUALIZAR_CAMPO, mas grava vários campos de uma vez
  // (config.valores) em vez de um só — pensado pra preencher um formulário
  // inteiro (ver enums/tipo-formulario-alvo.enum.ts) num único step, sem
  // precisar de um ACAO_ATUALIZAR_CAMPO por campo. Não valida os valores
  // contra o formulário (mesma filosofia de ACAO_ATUALIZAR_CAMPO: grava como
  // vier).
  ACAO_ATUALIZAR_CAMPOS_LOTE = 'ACAO_ATUALIZAR_CAMPOS_LOTE',
  ACAO_ATUALIZAR_TITULO = 'ACAO_ATUALIZAR_TITULO',
  ACAO_CRIAR_CARD_FILHO = 'ACAO_CRIAR_CARD_FILHO',
  ACAO_MOVER_CARD_PAI = 'ACAO_MOVER_CARD_PAI',
  ACAO_MOVER_CARD_FILHO = 'ACAO_MOVER_CARD_FILHO',
  ACAO_MOVER_CARD_ATUAL = 'ACAO_MOVER_CARD_ATUAL',
  CONSULTA_CARD = 'CONSULTA_CARD',
  CONSULTA_FORMULARIO_CARD = 'CONSULTA_FORMULARIO_CARD',
  CODIGO_JAVASCRIPT = 'CODIGO_JAVASCRIPT',
  CONDICAO = 'CONDICAO',
  // Repete tudo que é alcançável a partir dele (seu "corpo") um número fixo
  // de vezes, definido em config.quantidade — ver executarSequencia em
  // integracoes.service.ts. Só existe porque a execução do grafo inteiro já
  // roda em background (ver GatilhoExecucaoProcessor); antes disso um step
  // assim poderia travar a resposta HTTP de quem disparou o gatilho.
  REPETICAO = 'REPETICAO',
  HTTP_REQUEST = 'HTTP_REQUEST',
  EMAIL = 'EMAIL',
  // Emite um alerta em tempo real pro front do processo (ver
  // RealtimeGateway.emitirNotificacao) — sem side effect no card, só um
  // aviso visual. Não é terminal: roda de forma síncrona (nada fica pra
  // resolver depois, diferente de EMAIL), então pode ter conexão de saída.
  NOTIFICACAO = 'NOTIFICACAO',
  // Anexa 1 a 5 arquivos fixos (cadastrados na configuração do step, ver
  // MAX_ARQUIVOS_ACAO_ANEXAR_ARQUIVO em step-executors.ts) no card que
  // disparou a execução — pensado pra documentos repetitivos ("entrou na
  // fase B, anexa o termo padrão X"). Cada execução COPIA o arquivo-modelo
  // pra um objectKey novo (nunca reaproveita o mesmo) e cria um CardAnexo de
  // verdade, então aparece na listagem geral de anexos do card. Roda de
  // forma síncrona, não é terminal (pode ter conexão de saída).
  ACAO_ANEXAR_ARQUIVO = 'ACAO_ANEXAR_ARQUIVO',
  // Emite um PDF a partir de um PdfModelo cadastrado no processo, com os
  // dados atuais do card. Roda de forma SÍNCRONA (renderiza dentro da
  // transação da cadeia, com timeout — ver CardPdfEmissaoService.
  // emitirNoStep) e devolve o id do CardAnexo criado, que um step EMAIL
  // a jusante pode anexar via $stepRef. Não é terminal.
  ACAO_EMITIR_PDF = 'ACAO_EMITIR_PDF',
  // Aplica 1+ etiquetas do processo no card (config.etiquetaIds), somando às
  // que ele já tem (modo ADICIONAR) ou trocando todas (modo SUBSTITUIR).
  // Etiqueta que o card já tem não é tocada. Síncrono, não é terminal.
  ACAO_APLICAR_ETIQUETA = 'ACAO_APLICAR_ETIQUETA',
  // Define o vencimento do card: relativo (agora + dias/horas) ou absoluto
  // (dataHora, aceita {chave}/$stepRef). Sobrescreve o vencimento atual.
  ACAO_DEFINIR_VENCIMENTO = 'ACAO_DEFINIR_VENCIMENTO',
}

export const STEP_TIPOS_GATILHO = new Set<StepTipo>([
  StepTipo.GATILHO_CARD_ENTROU_NA_FASE,
  StepTipo.GATILHO_CAMPO_ATUALIZADO,
  StepTipo.GATILHO_CARD_CRIADO,
  StepTipo.GATILHO_CARD_VENCIDO,
  StepTipo.GATILHO_CARD_PRESTES_A_VENCER,
]);

// Steps cujo resultado real só existe depois que a execução do grafo já
// terminou (EMAIL enfileira o envio numa fila e sai — o handshake SMTP
// acontece fora da transação, ver src/email) — por isso não podem ter
// conexão de saída: nenhum step a jusante poderia enxergar o resultado de
// verdade na mesma execução. Validado em IntegracoesService.validarGrafo.
export const STEP_TIPOS_TERMINAL = new Set<StepTipo>([StepTipo.EMAIL]);
