import { StepTipo } from './enums/step-tipo.enum';
import { HttpMetodo } from './enums/http-metodo.enum';
import { EXEMPLOS_STEP_TIPOS } from './step-tipo-exemplos';
import { SONS_NOTIFICACAO } from '../sons/sons.catalogo';
import {
  DELAY_MS_PADRAO_REPETICAO,
  MAX_ARQUIVOS_ACAO_ANEXAR_ARQUIVO,
  MAX_ATRASO_TOTAL_MS_REPETICAO,
  MAX_DELAY_MS_REPETICAO,
  MAX_ITERACOES_REPETICAO,
} from './step-executors';
import {
  RAMO_REPETICAO_ENQUANTO,
  RAMO_REPETICAO_FINALIZADO,
} from './enums/repeticao-ramo.enum';
import {
  OPERADORES_POR_TIPO_DADO,
  OPERADORES_SEM_VALOR,
  OPERADORES_COM_VALOR_FINAL,
  RAMO_CONDICAO_SENAO,
} from '../common/enums/condicao.enum';
import {
  NotificacaoFormato,
  NotificacaoTamanho,
  NotificacaoTipo,
} from './enums/notificacao.enum';

// Metadado estático (não vem do banco) descrevendo cada tipo de step pro
// front montar o editor visual e o formulário de config de cada nó — nome,
// categoria, quais chaves de `config` esperar e o formato de `saida`
// disponível pra outros steps referenciarem via $stepRef. Servido em
// GET /processos/:processoId/integracoes/tipos-step.
export interface CampoConfigStep {
  chave: string;
  tipo: string;
  obrigatorio: boolean;
  descricao: string;
  // true = este campo aceita { "$stepRef": "<apelido>", "$campo": "<chave>" }
  // além de valor literal — o front precisa oferecer os dois modos de
  // entrada (ver instruções passadas na conversa). false = sempre literal
  // (campos estruturais como faseId/conexaoId/campo, validados contra o
  // banco já na criação da integração — não dá pra serem dinâmicos).
  aceitaReferencia: boolean;
  // true só em campos que são objeto/array livre (hoje: HTTP_REQUEST.headers
  // e .body) — além do campo inteiro poder ser um único $stepRef (mesmo
  // efeito de aceitaReferencia), QUALQUER valor dentro da estrutura, em
  // qualquer profundidade, também pode ser um $stepRef ou uma string com
  // {chave}. Omitido (undefined) equivale a false pra todo campo que não é
  // objeto/array.
  aceitaReferenciaAninhada?: boolean;
}

export interface ItemCatalogoStepTipo {
  tipo: StepTipo;
  categoria:
    | 'GATILHO'
    | 'ACAO'
    | 'CONSULTA'
    | 'CODIGO'
    | 'CONDICAO'
    | 'REPETICAO'
    | 'HTTP'
    | 'EMAIL'
    | 'NOTIFICACAO'
    | 'ANEXO';
  rotulo: string;
  descricao: string;
  exigeContaServico: boolean;
  aliasPermissao: string | null;
  config: CampoConfigStep[];
  saida: string[];
  // JSON de exemplo do que vai em IntegracaoStep.config e do que o step
  // devolve em `saida` (valores fictícios), pro front renderizar direto sem
  // precisar rodar a integração. Vem de step-tipo-exemplos.ts.
  exemploConfig: Record<string, unknown>;
  exemploSaida: Record<string, unknown>;
  // Só populado no item CONDICAO: operadores válidos por tipoDado, pro front
  // montar o seletor de operador sem precisar hardcodar a lista. `ramoOrigem`
  // de uma IntegracaoConexao saindo de um step CONDICAO deve ser um dos ids
  // configurados em config.ramos, ou `ramoSenao` (ramo padrão implícito).
  operadoresPorTipoDado?: Record<
    string,
    {
      operador: string;
      exigeValor: boolean;
      exigeValorFinal: boolean;
    }[]
  >;
  ramoSenao?: string;
  // Só populado no item REPETICAO: os dois ids fixos de ramoOrigem que suas
  // conexões de saída devem usar (mesmo campo ramoOrigem de CONDICAO, mas
  // aqui os dois ramos são sempre os mesmos dois, não vêm de config).
  // ramoEnquanto liga ao corpo (repete quantidade vezes); ramoFinalizado liga
  // ao que roda uma vez só, depois que o corpo já terminou todas as voltas.
  ramoEnquanto?: string;
  ramoFinalizado?: string;
}

type ItemCatalogoBase = Omit<
  ItemCatalogoStepTipo,
  'exemploConfig' | 'exemploSaida'
>;

const CATALOGO_BASE: ItemCatalogoBase[] = [
  {
    tipo: StepTipo.GATILHO_CARD_ENTROU_NA_FASE,
    categoria: 'GATILHO',
    rotulo: 'Card entrou na fase',
    descricao:
      'Dispara sempre que um card entra na fase configurada (criação ou movimentação).',
    exigeContaServico: false,
    aliasPermissao: null,
    config: [
      {
        chave: 'faseId',
        tipo: 'uuid',
        obrigatorio: true,
        descricao: 'Fase que dispara o gatilho',
        aceitaReferencia: false,
      },
    ],
    saida: ['cardId', 'titulo', 'campos', 'faseId'],
  },
  {
    tipo: StepTipo.GATILHO_CAMPO_ATUALIZADO,
    categoria: 'GATILHO',
    rotulo: 'Campo atualizado',
    descricao: 'Dispara sempre que o campo configurado do card é alterado.',
    exigeContaServico: false,
    aliasPermissao: null,
    config: [
      {
        chave: 'campo',
        tipo: 'string',
        obrigatorio: true,
        descricao: 'Chave do campo em card.campos',
        aceitaReferencia: false,
      },
    ],
    saida: ['cardId', 'titulo', 'campos', 'campo', 'valorAtual'],
  },
  {
    tipo: StepTipo.GATILHO_CARD_CRIADO,
    categoria: 'GATILHO',
    rotulo: 'Card criado',
    descricao:
      'Dispara sempre que um card novo é criado no processo (só na criação — não dispara de novo em movimentação). Disponível apenas no motor de Integração, sem equivalente em Automação.',
    exigeContaServico: false,
    aliasPermissao: null,
    config: [],
    saida: [
      'cardId',
      'titulo',
      'campos',
      'faseId',
      'processoId',
      'criadorId',
      'criadorNome',
    ],
  },
  {
    tipo: StepTipo.GATILHO_CARD_VENCIDO,
    categoria: 'GATILHO',
    rotulo: 'Card venceu',
    descricao:
      'Dispara quando o vencimento (dataVencimento) de um card do processo chega. Sem configuração: vale pra todos os cards do processo que têm data de vencimento, em qualquer fase. Uma varredura roda a cada minuto, então o disparo pode atrasar até ~1 minuto. Dispara uma única vez por card e por data de vencimento (adiar a data permite disparar de novo na data nova) e só se o vencimento ocorreu nas últimas 24h — cards vencidos há mais tempo não disparam, pra ligar uma integração num processo antigo não gerar uma enxurrada de execuções.',
    exigeContaServico: false,
    aliasPermissao: null,
    config: [],
    saida: [
      'cardId',
      'titulo',
      'campos',
      'faseId',
      'processoId',
      'dataVencimento',
    ],
  },
  {
    tipo: StepTipo.GATILHO_CARD_PRESTES_A_VENCER,
    categoria: 'GATILHO',
    rotulo: 'Card prestes a vencer',
    descricao:
      'Dispara quando faltam 24h ou menos para o vencimento (dataVencimento) de um card do processo (janela fixa de 24h). Sem configuração. Uma varredura roda a cada minuto. Dispara uma única vez por card e por data de vencimento e nunca depois de o card já ter vencido. Um card criado (ou com vencimento definido) já dentro da janela dispara na próxima varredura.',
    exigeContaServico: false,
    aliasPermissao: null,
    config: [],
    saida: [
      'cardId',
      'titulo',
      'campos',
      'faseId',
      'processoId',
      'dataVencimento',
    ],
  },
  {
    tipo: StepTipo.ACAO_ATUALIZAR_CAMPO,
    categoria: 'ACAO',
    rotulo: 'Atualizar campo',
    descricao: 'Escreve um valor em card.campos[campo].',
    exigeContaServico: true,
    aliasPermissao: 'card.editar',
    config: [
      {
        chave: 'campo',
        tipo: 'string',
        obrigatorio: true,
        descricao: 'Chave do campo a atualizar',
        aceitaReferencia: false,
      },
      {
        chave: 'valor',
        tipo: 'string | number | boolean | $stepRef',
        obrigatorio: true,
        descricao: 'Novo valor (aceita {chave} de card.campos ou $stepRef)',
        aceitaReferencia: true,
      },
    ],
    saida: ['campo', 'valorAntigo', 'valorNovo'],
  },
  {
    tipo: StepTipo.ACAO_ATUALIZAR_CAMPOS_LOTE,
    categoria: 'ACAO',
    rotulo: 'Atualizar campos em lote',
    descricao:
      'Escreve vários campos de uma vez em card.campos, pensado pra preencher um formulário inteiro num único step (config.tipoFormulario diz qual formulário — ENTRADA ou FASE, só documentacional). Não valida os valores contra o formulário (mesma filosofia de ACAO_ATUALIZAR_CAMPO: grava como vier). Por padrão atualiza o próprio card que disparou a execução; informando config.cardId, atualiza qualquer outro card (a conta de serviço precisa de card.editar no processo desse outro card também).',
    exigeContaServico: true,
    aliasPermissao: 'card.editar',
    config: [
      {
        chave: 'tipoFormulario',
        tipo: 'ENTRADA | FASE',
        obrigatorio: true,
        descricao:
          'Qual formulário estrutura os campos de "valores" (ENTRADA ou FASE) — só documentacional, não muda a execução.',
        aceitaReferencia: false,
      },
      {
        chave: 'cardId',
        tipo: 'uuid | $stepRef',
        obrigatorio: false,
        descricao:
          'Card a atualizar. Omitido = o próprio card que disparou a execução.',
        aceitaReferencia: true,
      },
      {
        chave: 'valores',
        tipo: 'object (campo -> valor)',
        obrigatorio: true,
        descricao:
          'Mapa campo -> novo valor. Cada valor, em qualquer profundidade, aceita {chave} de card.campos ou $stepRef.',
        aceitaReferencia: true,
        aceitaReferenciaAninhada: true,
      },
    ],
    saida: ['cardId', 'camposAtualizados'],
  },
  {
    tipo: StepTipo.ACAO_ATUALIZAR_TITULO,
    categoria: 'ACAO',
    rotulo: 'Atualizar título',
    descricao: 'Reescreve o título do card.',
    exigeContaServico: true,
    aliasPermissao: 'card.editar',
    config: [
      {
        chave: 'titulo',
        tipo: 'string',
        obrigatorio: true,
        descricao: 'Novo título (aceita {chave} de card.campos ou $stepRef)',
        aceitaReferencia: true,
      },
    ],
    saida: ['tituloAntigo', 'tituloNovo'],
  },
  {
    tipo: StepTipo.ACAO_CRIAR_CARD_FILHO,
    categoria: 'ACAO',
    rotulo: 'Criar card filho',
    descricao:
      'Cria um card filho através de uma ProcessoConexao já configurada.',
    exigeContaServico: true,
    aliasPermissao: 'card.criar',
    config: [
      {
        chave: 'conexaoId',
        tipo: 'uuid',
        obrigatorio: true,
        descricao: 'Id da ProcessoConexao',
        aceitaReferencia: false,
      },
      {
        chave: 'titulo',
        tipo: 'string',
        obrigatorio: false,
        descricao: 'Título do filho (default: título do card pai)',
        aceitaReferencia: true,
      },
    ],
    saida: ['criado', 'cardFilhoId', 'titulo'],
  },
  {
    tipo: StepTipo.ACAO_MOVER_CARD_PAI,
    categoria: 'ACAO',
    rotulo: 'Mover card pai',
    descricao: 'Move o card pai (se existir) para outra fase do processo dele.',
    exigeContaServico: true,
    aliasPermissao: 'card.mover',
    config: [
      {
        chave: 'faseDestinoId',
        tipo: 'uuid',
        obrigatorio: true,
        descricao: 'Fase de destino no processo do pai',
        aceitaReferencia: false,
      },
    ],
    saida: ['movido', 'cardId', 'faseDestinoId'],
  },
  {
    tipo: StepTipo.ACAO_MOVER_CARD_FILHO,
    categoria: 'ACAO',
    rotulo: 'Mover card filho',
    descricao:
      'Move o card filho (se já existir) criado através da conexão informada.',
    exigeContaServico: true,
    aliasPermissao: 'card.mover',
    config: [
      {
        chave: 'conexaoId',
        tipo: 'uuid',
        obrigatorio: true,
        descricao: 'Id da ProcessoConexao',
        aceitaReferencia: false,
      },
      {
        chave: 'faseDestinoId',
        tipo: 'uuid',
        obrigatorio: true,
        descricao: 'Fase de destino no processo do filho',
        aceitaReferencia: false,
      },
    ],
    saida: ['movido', 'cardId', 'faseDestinoId'],
  },
  {
    tipo: StepTipo.ACAO_MOVER_CARD_ATUAL,
    categoria: 'ACAO',
    rotulo: 'Mover card atual',
    descricao:
      'Move o próprio card que disparou o gatilho para outra fase do mesmo processo.',
    exigeContaServico: true,
    aliasPermissao: 'card.mover',
    config: [
      {
        chave: 'faseDestinoId',
        tipo: 'uuid',
        obrigatorio: true,
        descricao: 'Fase de destino no mesmo processo',
        aceitaReferencia: false,
      },
    ],
    saida: ['movido', 'cardId', 'faseDestinoId'],
  },
  {
    tipo: StepTipo.CONSULTA_CARD,
    categoria: 'CONSULTA',
    rotulo: 'Consultar card',
    descricao:
      'Busca um card por id (pode ser de outro processo, ex.: pai/filho) e retorna todos os seus dados.',
    exigeContaServico: true,
    aliasPermissao: 'card.visualizar',
    config: [
      {
        chave: 'cardId',
        tipo: 'uuid | $stepRef',
        obrigatorio: true,
        descricao: 'Id do card a consultar (aceita $stepRef de outro step)',
        aceitaReferencia: true,
      },
    ],
    saida: [
      'cardId',
      'titulo',
      'campos',
      'processoId',
      'faseAtualId',
      'paiCardId',
      'paiConexaoId',
      'filhos',
      'createdAt',
      'updatedAt',
    ],
  },
  {
    tipo: StepTipo.CONSULTA_FORMULARIO_CARD,
    categoria: 'CONSULTA',
    rotulo: 'Consultar formulário do card',
    descricao:
      'Busca um card por id e retorna seus campos já casados com o formularioEntrada do processo e o formularioFase de todas as fases dele (rótulo + valor), em vez do jsonb bruto de campos.',
    exigeContaServico: true,
    aliasPermissao: 'card.visualizar',
    config: [
      {
        chave: 'cardId',
        tipo: 'uuid | $stepRef',
        obrigatorio: true,
        descricao: 'Id do card a consultar (aceita $stepRef de outro step)',
        aceitaReferencia: true,
      },
    ],
    saida: ['cardId', 'campos (array de { id, rotulo, valor })'],
  },
  {
    tipo: StepTipo.CODIGO_JAVASCRIPT,
    categoria: 'CODIGO',
    rotulo: 'Código JavaScript',
    descricao:
      'Roda um trecho de JavaScript sandboxado (isolated-vm, sem rede/filesystem, timeout de 3s). Recebe `entradas` (config deste step já resolvido, exceto `codigo`) e `campos` (do card); deve terminar com return de um objeto plano.',
    exigeContaServico: true,
    aliasPermissao: 'integracao.executar_codigo',
    config: [
      {
        chave: 'codigo',
        tipo: 'string (código-fonte JS)',
        obrigatorio: true,
        descricao: 'Corpo de função; use return { chave: valor }',
        aceitaReferencia: false,
      },
    ],
    saida: ['(o que o código retornar)'],
  },
  {
    tipo: StepTipo.CONDICAO,
    categoria: 'CONDICAO',
    rotulo: 'Se/então (condição)',
    descricao:
      'Avalia um atributo contra uma lista ordenada de regras (primeira que bater vence) e expõe qual ramo foi escolhido em saida.ramoAtivo. As IntegracaoConexao que saem deste step precisam de "ramoOrigem" preenchido com o id de um dos ramos configurados, ou com o valor de ramoSenao — cada uma pode apontar pra um step de destino diferente, permitindo múltiplos caminhos a partir do mesmo step (inclusive outro CONDICAO em cadeia). Um step a jusante só roda se pelo menos uma de suas conexões de entrada estiver "ativa"; caso contrário aparece no histórico de execução com status PULADO.',
    exigeContaServico: true,
    aliasPermissao: 'integracao.avaliar_condicao',
    config: [
      {
        chave: 'atributo',
        tipo: 'string | $stepRef',
        obrigatorio: true,
        descricao:
          'Valor de entrada a comparar (aceita {chave} de card.campos ou $stepRef de outro step)',
        aceitaReferencia: true,
      },
      {
        chave: 'tipoDado',
        tipo: 'INTEIRO | BOOLEAN | STRING | DATA',
        obrigatorio: true,
        descricao:
          'Tipo do atributo — determina os operadores válidos em cada ramo (ver operadoresPorTipoDado)',
        aceitaReferencia: false,
      },
      {
        chave: 'ramos',
        tipo: 'array de { id: string, operador: string, valor?: any, valorFinal?: any }',
        obrigatorio: true,
        descricao:
          'Regras avaliadas em ordem, a primeira que bater decide o ramoAtivo. "id" é único por step e vira o "ramoOrigem" que as conexões de saída usam. "valor" é obrigatório em todo operador exceto VAZIO/PREENCHIDO; "valorFinal" é exigido apenas por ENTRE (valor = limite inferior, valorFinal = limite superior, ambos inclusive). Sempre literal — não aceita $stepRef.',
        aceitaReferencia: false,
      },
    ],
    saida: ['ramoAtivo', 'valorAvaliado'],
    ramoSenao: RAMO_CONDICAO_SENAO,
    operadoresPorTipoDado: Object.fromEntries(
      Object.entries(OPERADORES_POR_TIPO_DADO).map(([tipoDado, operadores]) => [
        tipoDado,
        operadores.map((operador) => ({
          operador,
          exigeValor: !OPERADORES_SEM_VALOR.has(operador),
          exigeValorFinal: OPERADORES_COM_VALOR_FINAL.has(operador),
        })),
      ]),
    ),
  },
  {
    tipo: StepTipo.REPETICAO,
    categoria: 'REPETICAO',
    rotulo: 'Repetir',
    descricao: `Tem duas saídas fixas: "${RAMO_REPETICAO_ENQUANTO}" (o corpo — tudo conectado a partir dela roda config.quantidade vezes seguidas) e "${RAMO_REPETICAO_FINALIZADO}" (roda uma única vez, depois que todas as voltas do corpo já terminaram). As IntegracaoConexao saindo deste step precisam de "ramoOrigem" igual a um desses dois ids (ver ramoEnquanto/ramoFinalizado) — mesmo mecanismo de ramoOrigem que CONDICAO usa. Cada volta injeta repeticaoIndice (começando em 0), disponível como {repeticaoIndice} em qualquer config de string dos steps do corpo, junto dos campos do card. Um step não pode ser alcançável pelos dois ramos ao mesmo tempo, e nenhum step do corpo (ENQUANTO) pode receber conexão de fora dele — a API recusa a integração inteira nesses dois casos. Cada volta do corpo gera sua própria linha na auditoria (GET .../execucoes).`,
    exigeContaServico: true,
    aliasPermissao: 'integracao.repetir',
    config: [
      {
        chave: 'quantidade',
        tipo: 'number',
        obrigatorio: true,
        descricao: `Quantas vezes repetir o corpo (ramo ${RAMO_REPETICAO_ENQUANTO}) — inteiro entre 1 e ${MAX_ITERACOES_REPETICAO}. Sempre literal, não aceita {chave} nem $stepRef.`,
        aceitaReferencia: false,
      },
      {
        chave: 'delayMs',
        tipo: 'number',
        obrigatorio: false,
        descricao: `Espera (em milissegundos) entre uma volta e outra do corpo — nunca depois da última. Default ${DELAY_MS_PADRAO_REPETICAO}ms quando omitido; inteiro >= 0, até ${MAX_DELAY_MS_REPETICAO}ms. Além disso, (quantidade - 1) x delayMs não pode passar de ${MAX_ATRASO_TOTAL_MS_REPETICAO}ms no total. Sempre literal, não aceita {chave} nem $stepRef.`,
        aceitaReferencia: false,
      },
    ],
    saida: ['quantidade', 'delayMs'],
    ramoEnquanto: RAMO_REPETICAO_ENQUANTO,
    ramoFinalizado: RAMO_REPETICAO_FINALIZADO,
  },
  {
    tipo: StepTipo.HTTP_REQUEST,
    categoria: 'HTTP',
    rotulo: 'Requisição HTTP',
    descricao:
      'Chama uma URL externa (http/https) e expõe a resposta inteira pros próximos steps. Corpo 4xx/5xx da API NÃO derruba a integração (vem em saida.sucesso=false) — só falha de transporte (timeout, DNS, conexão recusada) derruba a cadeia. Sem restrição de IP/rede privada.',
    exigeContaServico: true,
    aliasPermissao: 'integracao.executar_http',
    config: [
      {
        chave: 'url',
        tipo: 'string | $stepRef',
        obrigatorio: true,
        descricao:
          'URL completa, só http:// ou https:// (aceita {chave} de card.campos ou $stepRef)',
        aceitaReferencia: true,
      },
      {
        chave: 'metodo',
        tipo: Object.values(HttpMetodo).join(' | '),
        obrigatorio: true,
        descricao: 'Método HTTP',
        aceitaReferencia: false,
      },
      {
        chave: 'headers',
        tipo: 'object (chave: valor)',
        obrigatorio: false,
        descricao:
          'Cabeçalhos da requisição (ex.: Authorization). Cada valor, em qualquer profundidade, aceita {chave} ou $stepRef',
        aceitaReferencia: true,
        aceitaReferenciaAninhada: true,
      },
      {
        chave: 'body',
        tipo: 'object | string',
        obrigatorio: false,
        descricao:
          'Corpo da requisição — não permitido com metodo GET/DELETE. Objeto vira JSON automaticamente (Content-Type é setado sozinho se você não definir um em headers). Cada valor, em qualquer profundidade, aceita {chave} ou $stepRef',
        aceitaReferencia: true,
        aceitaReferenciaAninhada: true,
      },
      {
        chave: 'timeoutMs',
        tipo: 'number',
        obrigatorio: false,
        descricao: 'Timeout em ms — default 10000, máximo 30000',
        aceitaReferencia: false,
      },
    ],
    saida: ['statusCode', 'sucesso', 'headers', 'corpo'],
  },
  {
    tipo: StepTipo.EMAIL,
    categoria: 'EMAIL',
    rotulo: 'Enviar email',
    descricao:
      'Enfileira um envio de email através de um provedor configurado na organização (ver GET /provedores-email). O envio de verdade roda numa fila em segundo plano — não trava a operação que disparou o step. Step terminal: não aceita conexão de saída, porque o resultado real do envio (sucesso/erro, resposta do provedor) só fica disponível depois, em auditoria (GET /email-envios), não dentro desta execução.',
    exigeContaServico: true,
    aliasPermissao: 'integracao.enviar_email',
    config: [
      {
        chave: 'provedorId',
        tipo: 'uuid',
        obrigatorio: true,
        descricao: 'Id do provedor de email (GET /provedores-email)',
        aceitaReferencia: false,
      },
      {
        chave: 'destinatarios',
        tipo: 'string | $stepRef',
        obrigatorio: true,
        descricao:
          'Emails separados por vírgula (aceita {chave} de card.campos ou $stepRef)',
        aceitaReferencia: true,
      },
      {
        chave: 'cc',
        tipo: 'string | $stepRef',
        obrigatorio: false,
        descricao:
          'Emails em cópia, separados por vírgula (mesmo formato de destinatarios)',
        aceitaReferencia: true,
      },
      {
        chave: 'assunto',
        tipo: 'string | $stepRef',
        obrigatorio: true,
        descricao:
          'Assunto do email (aceita {chave} de card.campos ou $stepRef)',
        aceitaReferencia: true,
      },
      {
        chave: 'corpo',
        tipo: 'string | $stepRef',
        obrigatorio: true,
        descricao:
          'Corpo do email em HTML (aceita {chave} de card.campos ou $stepRef)',
        aceitaReferencia: true,
      },
      {
        chave: 'anexoIds',
        tipo: 'array de (uuid | $stepRef) | $stepRef',
        obrigatorio: false,
        descricao:
          'Ids de CardAnexo já existentes neste card (ver POST .../cards/:id/anexos) — cada um vira um anexo do email, lido do MinIO na hora do envio. Cada item do array pode ser um uuid literal ou um $stepRef (ex.: o id devolvido por um CODIGO_JAVASCRIPT); a chave inteira também pode ser um único $stepRef (ex.: o `anexoIds` de um ACAO_ANEXAR_ARQUIVO). Se a referência resolver para algo que não é id de anexo (step/campo sem saída), o step falha em vez de enviar sem o anexo.',
        aceitaReferencia: true,
        aceitaReferenciaAninhada: true,
      },
    ],
    saida: ['envioId', 'status'],
  },
  {
    tipo: StepTipo.NOTIFICACAO,
    categoria: 'NOTIFICACAO',
    rotulo: 'Emitir notificação',
    descricao:
      'Emite um alerta em tempo real (WebSocket, evento "notificacao:emitida" na sala do processo) pro front exibir com um botão OK — não altera o card. Roda de forma síncrona: o resultado já sai pronto nesta execução. IMPORTANTE — sanitização: quando config.formato = "HTML", o backend sanitiza o conteúdo antes de emitir. Allowlist ampla de tags (negrito/itálico/sublinhado, títulos h1-h6, listas, div/span, tabela, imagem só http/https, links) e de CSS inline via style — cor (color/background/background-color/border-color, só cor sólida, nunca url()), fonte (font-family/font-size/font-weight/font-style/line-height/text-align/text-decoration), espaçamento com variantes direcionais (padding[-top/right/bottom/left], margin[-top/right/bottom/left]), borda (border[-top/right/bottom/left]/border-radius), dimensão (width/height/max-width/min-width/max-height/min-height/box-sizing) e layout flex (display/align-items/justify-content/gap/flex-direction/flex-wrap) — cobre templates de card de notificação com ícone, seções e layout em coluna/linha. NÃO passam: <script>, <iframe>, <object>, <embed>, <form>, qualquer atributo on* (onclick/onerror/...), URLs "javascript:", e propriedades CSS de layout/exfiltração (position, z-index, top/left/right/bottom, background-image, content) — removidos mesmo que estivessem no config original. Links ganham target="_blank" rel="noopener noreferrer" automaticamente. Isso existe porque config.conteudo pode vir de $stepRef de uma API externa (HTTP_REQUEST) ou de CODIGO_JAVASCRIPT, nunca confiável por padrão. Quando formato = "TEXTO", o conteúdo sai como veio (interpolado), sem sanitização de HTML — o front deve renderizar como texto puro (nunca via innerHTML/dangerouslySetInnerHTML) para esse formato.',
    exigeContaServico: true,
    aliasPermissao: 'integracao.emitir_notificacao',
    config: [
      {
        chave: 'tipo',
        tipo: Object.values(NotificacaoTipo).join(' | '),
        obrigatorio: true,
        descricao: 'Estilo visual do alerta',
        aceitaReferencia: false,
      },
      {
        chave: 'tamanho',
        tipo: Object.values(NotificacaoTamanho).join(' | '),
        obrigatorio: true,
        descricao: 'Tamanho do componente de alerta no front',
        aceitaReferencia: false,
      },
      {
        chave: 'formato',
        tipo: Object.values(NotificacaoFormato).join(' | '),
        obrigatorio: true,
        descricao:
          'TEXTO = renderizar como texto puro. HTML = backend sanitiza antes de emitir (ver descrição do step) e front pode inserir via innerHTML.',
        aceitaReferencia: false,
      },
      {
        chave: 'conteudo',
        tipo: 'string | $stepRef',
        obrigatorio: true,
        descricao:
          'Corpo do alerta (aceita {chave} de card.campos ou $stepRef). Sanitizado no backend quando formato = HTML.',
        aceitaReferencia: true,
      },
      {
        chave: 'som',
        tipo: SONS_NOTIFICACAO.map((s) => s.id).join(' | '),
        obrigatorio: false,
        descricao:
          'Som tocado no front quando o alerta aparece (opcional — omitido = sem som). Catálogo fixo em GET /sons (id, rotulo, url); o arquivo de cada som pode ser pré-ouvido em GET /sons/:id/arquivo (rota pública, serve mp3).',
        aceitaReferencia: false,
      },
    ],
    saida: ['tipo', 'tamanho', 'formato', 'conteudo', 'som'],
  },
  {
    tipo: StepTipo.ACAO_ANEXAR_ARQUIVO,
    categoria: 'ANEXO',
    rotulo: 'Anexar arquivo',
    descricao: `Anexa de 1 a ${MAX_ARQUIVOS_ACAO_ANEXAR_ARQUIVO} arquivos fixos (cadastrados aqui no step) no card que disparou a execução — pensado pra documentos repetitivos (ex.: "entrou na fase B, anexa o termo padrão"). Cada execução copia o(s) arquivo(s)-modelo pra um anexo novo e independente (nunca reaproveita o mesmo objeto): vira um CardAnexo de verdade, aparece na listagem geral de anexos do card (GET .../cards/:id/anexos) e no histórico. Antes de criar/editar o step, envie cada arquivo em POST .../integracoes/arquivos-step (multipart, campo "arquivo") e use o retorno (objectKey/nomeOriginal/mimeType/tamanho) em config.arquivos — o step não aceita ser salvo sem arquivo. Não é terminal: a cópia é síncrona, pode ter conexão de saída.`,
    exigeContaServico: true,
    aliasPermissao: 'integracao.anexar_arquivo',
    config: [
      {
        chave: 'arquivos',
        tipo: `array de { objectKey, nomeOriginal, mimeType, tamanho } (1 a ${MAX_ARQUIVOS_ACAO_ANEXAR_ARQUIVO} itens)`,
        obrigatorio: true,
        descricao:
          'Arquivos-modelo a anexar, na ordem que devem virar anexos. Cada item vem do retorno de POST .../integracoes/arquivos-step. Sempre literal — não aceita {chave} nem $stepRef.',
        aceitaReferencia: false,
      },
    ],
    saida: ['anexoIds', 'quantidade'],
  },
  {
    tipo: StepTipo.ACAO_EMITIR_PDF,
    categoria: 'ANEXO',
    rotulo: 'Emitir PDF',
    descricao:
      'Gera um PDF a partir de um modelo de PDF cadastrado no processo (ver GET /processos/:processoId/pdf-modelos), preenchido com os dados ATUAIS do card — inclusive campos que outros steps anteriores da mesma cadeia acabaram de gravar. O PDF vira um anexo do card (aparece em GET .../cards/:id/anexos e no histórico) e também uma emissão em GET .../cards/:id/pdf-emissoes. O resultado sai pronto nesta execução: `anexoId` pode ser usado em um step EMAIL a jusante (config.anexoIds -> $stepRef). Roda de forma síncrona dentro da transação da cadeia: a renderização tem timeout de 15s e o servidor gera no máximo 3 PDFs ao mesmo tempo — se estourar (ou o modelo falhar), a cadeia inteira é desfeita, como em qualquer outro step. Não é terminal.',
    exigeContaServico: true,
    aliasPermissao: 'pdfModelo.emitir',
    config: [
      {
        chave: 'modeloId',
        tipo: 'uuid',
        obrigatorio: true,
        descricao:
          'Id do modelo de PDF (deve pertencer a este processo — validado ao salvar a integração)',
        aceitaReferencia: false,
      },
    ],
    saida: ['anexoId', 'emissaoId', 'nome'],
  },
  {
    tipo: StepTipo.ACAO_APLICAR_ETIQUETA,
    categoria: 'ACAO',
    rotulo: 'Aplicar etiqueta',
    descricao:
      'Aplica 1 ou mais etiquetas do processo (ver GET /processos/:processoId/etiquetas) no card que disparou a execução. Com modo ADICIONAR, soma às etiquetas que o card já tem; com modo SUBSTITUIR, remove todas as etiquetas do card e deixa só as configuradas aqui. Se o card já tem uma das etiquetas, ela não é tocada nem duplicada (e se nada mudar, nenhum evento de histórico é gerado). Se uma etiqueta configurada for apagada depois de o step ser salvo, a execução falha e a cadeia inteira é desfeita. Não é terminal.',
    exigeContaServico: true,
    aliasPermissao: 'card.editar',
    config: [
      {
        chave: 'etiquetaIds',
        tipo: 'array de uuid (1 ou mais)',
        obrigatorio: true,
        descricao:
          'Ids das etiquetas a aplicar. Devem pertencer a este processo — validado ao salvar a integração. Sempre literal — não aceita {chave} nem $stepRef.',
        aceitaReferencia: false,
      },
      {
        chave: 'modo',
        tipo: 'ADICIONAR | SUBSTITUIR',
        obrigatorio: true,
        descricao:
          'ADICIONAR: mantém as etiquetas atuais do card e acrescenta as configuradas. SUBSTITUIR: limpa todas as etiquetas do card e aplica só as configuradas.',
        aceitaReferencia: false,
      },
    ],
    saida: ['adicionadas', 'removidas', 'etiquetaIds'],
  },
  {
    tipo: StepTipo.ACAO_DEFINIR_VENCIMENTO,
    categoria: 'ACAO',
    rotulo: 'Definir vencimento',
    descricao:
      'Define a data/hora de vencimento do card que disparou a execução, sobrescrevendo a atual. Modo RELATIVO: agora + config.dias (x24h) + config.horas (ex.: "entrou na fase, vence em 3 dias"). Modo ABSOLUTO: usa config.dataHora (ISO 8601), que aceita {chave} de um campo do card ou $stepRef. Registra o evento VENCIMENTO_ATUALIZADO no histórico. Mudar a data permite os gatilhos de vencimento dispararem de novo na data nova. Não é terminal.',
    exigeContaServico: true,
    aliasPermissao: 'card.editar',
    config: [
      {
        chave: 'modo',
        tipo: 'RELATIVO | ABSOLUTO',
        obrigatorio: true,
        descricao:
          'RELATIVO: agora + dias/horas. ABSOLUTO: data/hora informada em dataHora.',
        aceitaReferencia: false,
      },
      {
        chave: 'dias',
        tipo: 'inteiro >= 0',
        obrigatorio: false,
        descricao:
          'Só no modo RELATIVO. Dias (de 24h corridas) a somar a partir de agora. Dias e horas não podem ser ambos zero.',
        aceitaReferencia: false,
      },
      {
        chave: 'horas',
        tipo: 'inteiro >= 0',
        obrigatorio: false,
        descricao: 'Só no modo RELATIVO. Horas a somar a partir de agora.',
        aceitaReferencia: false,
      },
      {
        chave: 'dataHora',
        tipo: 'string ISO 8601 ou $stepRef',
        obrigatorio: false,
        descricao:
          'Só no modo ABSOLUTO (obrigatório nele). Ex.: 2026-09-25T20:00:00Z, ou "{prazo}" pra usar um campo do card. Data inválida na execução falha e desfaz a cadeia.',
        aceitaReferencia: true,
      },
    ],
    saida: ['dataVencimentoAnterior', 'dataVencimento'],
  },
];

export const CATALOGO_STEP_TIPOS: ItemCatalogoStepTipo[] = CATALOGO_BASE.map(
  (item) => ({ ...item, ...EXEMPLOS_STEP_TIPOS[item.tipo] }),
);
