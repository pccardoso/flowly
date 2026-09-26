import { randomUUID } from 'crypto';
import ivm from 'isolated-vm';
import { In } from 'typeorm';
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Card } from '../cards/entities/card.entity';
import { CardAnexo } from '../cards/entities/card-anexo.entity';
import { AnexoEmailEnvio } from '../email/entities/email-envio.entity';
import { User } from '../users/entities/user.entity';
import { Processo } from '../processos/entities/processo.entity';
import { ProcessoConexao } from '../processos/entities/processo-conexao.entity';
import { Fase } from '../fases/entities/fase.entity';
import { CampoFormulario } from '../processos/formulario/campo-formulario.interface';
import {
  criarCardEmFase,
  moverCardParaFase,
} from '../cards/card-creation.helper';
import { registrarEventoCard } from '../cards/card-evento.helper';
import { CardEventoTipo } from '../cards/enums/card-evento-tipo.enum';
import { dispararGatilhosCampoAtualizado } from '../cards/gatilho-dispatch.helper';
import { StepTipo } from './enums/step-tipo.enum';
import {
  ContextoExecucaoStep,
  DepsValidacaoStep,
  StepExecutor,
} from './step-executor.interface';
import {
  ehReferenciaStep,
  ehStringOuReferencia,
} from './integracao-config.util';
import {
  CondicaoOperador,
  CondicaoTipoDado,
  OPERADORES_COM_VALOR_FINAL,
  OPERADORES_POR_TIPO_DADO,
  OPERADORES_SEM_VALOR,
  RAMO_CONDICAO_SENAO,
} from '../common/enums/condicao.enum';
import { avaliarCondicao, RegraCondicao } from '../common/condicao.util';
import { HttpMetodo, METODOS_SEM_BODY } from './enums/http-metodo.enum';
import { TipoFormularioAlvo } from './enums/tipo-formulario-alvo.enum';
import {
  NotificacaoFormato,
  NotificacaoTamanho,
  NotificacaoTipo,
} from './enums/notificacao.enum';
import { sanitizarHtml } from '../common/html-sanitize.util';
import { buscarSom, SONS_NOTIFICACAO } from '../sons/sons.catalogo';
import { ArquivoStepReferencia } from './arquivo-step-referencia.interface';
import { ModoAplicarEtiqueta } from './enums/modo-aplicar-etiqueta.enum';
import {
  definirEtiquetasDoCard,
  listarEtiquetasDoCard,
} from '../cards/card-etiquetas.helper';

const REGEX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sandbox do step CODIGO_JAVASCRIPT: V8 isolado de verdade (isolated-vm), sem
// acesso a rede/filesystem/timers do processo host — só `entradas` (config
// já resolvido, incluindo saídas de steps conectados) e `campos` (do card)
// entram; o script deve `return` um objeto plano, que vira a saída do step.
const TIMEOUT_MS_CODIGO_JAVASCRIPT = 3000;
const MEMORY_LIMIT_MB_CODIGO_JAVASCRIPT = 32;

// Tetos do step REPETICAO — todos validados na criação/edição da integração
// (não em runtime: quantidade/delayMs são sempre literais, nunca $stepRef,
// então não há como crescerem além do que já foi validado aqui).
export const MAX_ITERACOES_REPETICAO = 50;
// O loop roda dentro da transação do worker em segundo plano (ver
// GatilhoExecucaoProcessor) — um delay entre iterações mantém essa
// transação (e a conexão com o Postgres) aberta parada durante a espera.
// Não afeta o usuário (já roda em background), mas precisa de um teto pra
// "quantidade alta + delay alto" não segurar uma conexão do pool por tempo
// demais.
export const DELAY_MS_PADRAO_REPETICAO = 5_000;
export const MAX_DELAY_MS_REPETICAO = 60_000;
export const MAX_ATRASO_TOTAL_MS_REPETICAO = 120_000;

// Teto do step ACAO_ANEXAR_ARQUIVO — pedido explícito do usuário (ver
// conversa): no mínimo 1, no máximo 5 arquivos-modelo por step.
export const MAX_ARQUIVOS_ACAO_ANEXAR_ARQUIVO = 5;

function ehArquivoStepReferenciaValido(
  valor: unknown,
): valor is ArquivoStepReferencia {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const v = valor as Record<string, unknown>;
  return (
    typeof v.objectKey === 'string' &&
    v.objectKey.trim().length > 0 &&
    typeof v.nomeOriginal === 'string' &&
    v.nomeOriginal.trim().length > 0 &&
    typeof v.mimeType === 'string' &&
    v.mimeType.trim().length > 0 &&
    typeof v.tamanho === 'number'
  );
}

async function rodarCodigoJavascript(
  codigo: string,
  entradas: Record<string, unknown>,
  campos: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const isolate = new ivm.Isolate({
    memoryLimit: MEMORY_LIMIT_MB_CODIGO_JAVASCRIPT,
  });
  try {
    const contexto = await isolate.createContext();
    await contexto.global.set(
      'entradas',
      new ivm.ExternalCopy(entradas).copyInto(),
    );
    await contexto.global.set(
      'campos',
      new ivm.ExternalCopy(campos).copyInto(),
    );

    const codigoEnvolvido = `(function () {\n${codigo}\n})()`;
    const resultado: unknown = await contexto.eval(codigoEnvolvido, {
      timeout: TIMEOUT_MS_CODIGO_JAVASCRIPT,
      copy: true,
    });

    if (
      typeof resultado !== 'object' ||
      resultado === null ||
      Array.isArray(resultado)
    ) {
      throw new UnprocessableEntityException(
        'O código do step CODIGO_JAVASCRIPT deve retornar um objeto (ex.: return { chave: valor })',
      );
    }
    return resultado as Record<string, unknown>;
  } finally {
    isolate.dispose();
  }
}

// "a@b.com, c@d.com" -> ["a@b.com", "c@d.com"]; usado pelos campos
// destinatarios/cc do step EMAIL (ver validação/execução abaixo).
function parseListaEmails(valor: string | undefined): string[] {
  if (!valor) {
    return [];
  }
  return valor
    .split(',')
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}

function exigirServiceAccount(ctx: ContextoExecucaoStep): void {
  if (!ctx.step.usuarioServicoId) {
    throw new ForbiddenException(
      `Step "${ctx.step.apelido}" não tem conta de serviço configurada`,
    );
  }
}

function saidaGatilhoVencimento(card: Card): Record<string, unknown> {
  return {
    cardId: card.id,
    titulo: card.titulo,
    campos: card.campos,
    faseId: card.faseAtualId,
    processoId: card.processoId,
    dataVencimento: card.dataVencimento?.toISOString() ?? null,
  };
}

const MODOS_DEFINIR_VENCIMENTO = ['RELATIVO', 'ABSOLUTO'] as const;
const MS_HORA = 60 * 60 * 1000;

// Step HTTP_REQUEST: chama uma URL externa (http/https only) com timeout
// obrigatório e teto de tamanho de resposta — sem restrição de IP/rede
// privada (decisão deliberada, ver conversa: este ambiente não bloqueia
// SSRF por IP, só limita protocolo/tempo/tamanho).
const HTTP_TIMEOUT_PADRAO_MS = 10_000;
const HTTP_TIMEOUT_MAXIMO_MS = 30_000;
const HTTP_TAMANHO_MAXIMO_RESPOSTA_BYTES = 5 * 1024 * 1024;

// Só http(s) — bloqueia file://, ftp://, etc. Chamado duas vezes: em
// validarConfig (quando config.url já é um literal, pra dar erro na hora de
// salvar a integração em vez de só na primeira execução) e em executar
// (sempre, porque uma url vinda de $stepRef só existe em tempo de execução).
function validarProtocoloUrl(url: string): URL {
  let urlValida: URL;
  try {
    urlValida = new URL(url);
  } catch {
    throw new UnprocessableEntityException(`config.url inválida: "${url}"`);
  }
  if (urlValida.protocol !== 'http:' && urlValida.protocol !== 'https:') {
    throw new UnprocessableEntityException(
      'config.url precisa ser http:// ou https://',
    );
  }
  return urlValida;
}

// Lê o corpo da resposta em chunks, abortando assim que passar do limite —
// evita carregar uma resposta gigante inteira em memória antes de perceber
// que ela estourou o teto.
async function lerCorpoComLimite(
  response: Response,
  limiteBytes: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return '';
  }
  const decoder = new TextDecoder();
  let total = 0;
  let texto = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > limiteBytes) {
      await reader.cancel();
      throw new UnprocessableEntityException(
        `Resposta excedeu o limite de ${limiteBytes} bytes`,
      );
    }
    texto += decoder.decode(value, { stream: true });
  }
  texto += decoder.decode();
  return texto;
}

export const STEP_EXECUTORS: Record<StepTipo, StepExecutor> = {
  [StepTipo.GATILHO_CARD_ENTROU_NA_FASE]: {
    ehGatilho: true,
    async validarConfig(processoId, config, deps: DepsValidacaoStep) {
      if (typeof config?.faseId !== 'string') {
        throw new UnprocessableEntityException(
          'config.faseId é obrigatório para o step GATILHO_CARD_ENTROU_NA_FASE',
        );
      }
      const fase = await deps.faseRepository.findOne({
        where: { id: config.faseId, processoId },
      });
      if (!fase) {
        throw new NotFoundException(
          'Fase informada em config.faseId não encontrada neste processo',
        );
      }
    },
    executar(ctx) {
      return {
        cardId: ctx.card.id,
        titulo: ctx.card.titulo,
        campos: ctx.card.campos,
        faseId: (ctx.step.config as { faseId: string }).faseId,
      };
    },
  },

  [StepTipo.GATILHO_CAMPO_ATUALIZADO]: {
    ehGatilho: true,
    validarConfig(_processoId, config) {
      if (typeof config?.campo !== 'string' || !config.campo.trim()) {
        throw new UnprocessableEntityException(
          'config.campo é obrigatório (string) para o step GATILHO_CAMPO_ATUALIZADO',
        );
      }
    },
    executar(ctx) {
      const campo = (ctx.step.config as { campo: string }).campo;
      return {
        cardId: ctx.card.id,
        titulo: ctx.card.titulo,
        campos: ctx.card.campos,
        campo,
        valorAtual: ctx.card.campos[campo] ?? null,
      };
    },
  },

  // Único gatilho que existe só no motor de Integracao (ver comentário em
  // enums/step-tipo.enum.ts) — dispara pra todo card criado no processo,
  // sem config (não é por fase: criação sempre cai na fase inicial do
  // processo, então filtrar por fase aqui seria redundante).
  [StepTipo.GATILHO_CARD_CRIADO]: {
    ehGatilho: true,
    validarConfig() {
      // Sem config — nada a validar.
    },
    async executar(ctx) {
      const criadorId = ctx.ator.usuarioId;
      const criador = criadorId
        ? await ctx.manager.findOne(User, { where: { id: criadorId } })
        : null;
      return {
        cardId: ctx.card.id,
        titulo: ctx.card.titulo,
        campos: ctx.card.campos,
        faseId: ctx.card.faseAtualId,
        processoId: ctx.card.processoId,
        criadorId,
        criadorNome: criador?.nome ?? null,
      };
    },
  },

  // Gatilhos de vencimento: disparados pela varredura de src/vencimentos, sem
  // config (valem pra todo card do processo com dataVencimento).
  [StepTipo.GATILHO_CARD_VENCIDO]: {
    ehGatilho: true,
    validarConfig() {
      // Sem config — nada a validar.
    },
    executar(ctx) {
      return saidaGatilhoVencimento(ctx.card);
    },
  },

  [StepTipo.GATILHO_CARD_PRESTES_A_VENCER]: {
    ehGatilho: true,
    validarConfig() {
      // Sem config — nada a validar.
    },
    executar(ctx) {
      return saidaGatilhoVencimento(ctx.card);
    },
  },

  [StepTipo.ACAO_ATUALIZAR_CAMPO]: {
    ehGatilho: false,
    aliasPermissao: 'card.editar',
    validarConfig(_processoId, config) {
      if (typeof config?.campo !== 'string' || !config.campo.trim()) {
        throw new UnprocessableEntityException(
          'config.campo é obrigatório (string) para o step ACAO_ATUALIZAR_CAMPO',
        );
      }
      if (!('valor' in config)) {
        throw new UnprocessableEntityException(
          'config.valor é obrigatório para o step ACAO_ATUALIZAR_CAMPO',
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { campo, valor } = ctx.entradas as {
        campo: string;
        valor: unknown;
      };
      const valorAntigo = ctx.card.campos[campo];
      ctx.card.campos = { ...ctx.card.campos, [campo]: valor };
      await ctx.manager.save(ctx.card);
      ctx.cardsAtualizados?.set(ctx.card.id, ctx.card);
      await registrarEventoCard(ctx.manager, {
        cardId: ctx.card.id,
        tipo: CardEventoTipo.CAMPO_ATUALIZADO,
        ator: ctx.ator,
        dadosAntes: { [campo]: valorAntigo ?? null },
        dadosDepois: { [campo]: valor },
      });
      await dispararGatilhosCampoAtualizado(
        ctx.manager,
        ctx.card,
        [campo],
        ctx.automacoesService,
        ctx.integracoesService,
        ctx.cardsCriados,
        ctx.profundidade + 1,
        ctx.cardsAtualizados,
      );
      return { campo, valorAntigo: valorAntigo ?? null, valorNovo: valor };
    },
  },

  // Igual a ACAO_ATUALIZAR_CAMPO, mas grava vários campos de uma vez —
  // pensado pra preencher um formulário inteiro (config.tipoFormulario) num
  // único step. Não valida os valores contra o schema do formulário (mesma
  // filosofia de ACAO_ATUALIZAR_CAMPO: grava como vier — decisão explícita,
  // ver conversa). `cardId` é opcional: se omitido, atualiza o próprio card
  // que disparou a execução; se informado (literal ou $stepRef), pode
  // apontar pra qualquer outro card — por isso a permissão é checada aqui
  // dentro (permissaoNoExecutor), depois de resolver o processo real do
  // card alvo, igual a CONSULTA_CARD.
  [StepTipo.ACAO_ATUALIZAR_CAMPOS_LOTE]: {
    ehGatilho: false,
    aliasPermissao: 'card.editar',
    permissaoNoExecutor: true,
    validarConfig(_processoId, config) {
      if (
        config?.tipoFormulario !== TipoFormularioAlvo.ENTRADA &&
        config?.tipoFormulario !== TipoFormularioAlvo.FASE
      ) {
        throw new UnprocessableEntityException(
          `config.tipoFormulario deve ser um de: ${Object.values(TipoFormularioAlvo).join(', ')}`,
        );
      }
      if ('cardId' in config && !ehStringOuReferencia(config.cardId)) {
        throw new UnprocessableEntityException(
          'config.cardId deve ser uma string (uuid) ou $stepRef quando informado',
        );
      }
      if (
        typeof config?.valores !== 'object' ||
        config.valores === null ||
        Array.isArray(config.valores) ||
        Object.keys(config.valores).length === 0
      ) {
        throw new UnprocessableEntityException(
          'config.valores é obrigatório (objeto não vazio de campo -> valor) para o step ACAO_ATUALIZAR_CAMPOS_LOTE',
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { cardId, valores } = ctx.entradas as {
        cardId?: string;
        valores: Record<string, unknown>;
      };

      const cardAlvo = cardId
        ? await ctx.manager.findOne(Card, { where: { id: cardId } })
        : ctx.card;
      if (!cardAlvo) {
        throw new NotFoundException(
          `Card referenciado em config.cardId (${cardId}) não encontrado`,
        );
      }

      const permitido = await ctx.integracoesService.verificarPermissaoServico(
        ctx.step.usuarioServicoId!,
        'card.editar',
        cardAlvo.processoId,
      );
      if (!permitido) {
        throw new ForbiddenException(
          `Conta de serviço do step "${ctx.step.apelido}" sem permissão: card.editar`,
        );
      }

      const camposAntigos = cardAlvo.campos;
      cardAlvo.campos = { ...cardAlvo.campos, ...valores };
      await ctx.manager.save(cardAlvo);
      ctx.cardsAtualizados?.set(cardAlvo.id, cardAlvo);

      const chavesAlteradas = Object.keys(valores);
      await registrarEventoCard(ctx.manager, {
        cardId: cardAlvo.id,
        tipo: CardEventoTipo.CAMPO_ATUALIZADO,
        ator: ctx.ator,
        dadosAntes: Object.fromEntries(
          chavesAlteradas.map((chave) => [chave, camposAntigos[chave] ?? null]),
        ),
        dadosDepois: Object.fromEntries(
          chavesAlteradas.map((chave) => [chave, cardAlvo.campos[chave]]),
        ),
      });
      await dispararGatilhosCampoAtualizado(
        ctx.manager,
        cardAlvo,
        chavesAlteradas,
        ctx.automacoesService,
        ctx.integracoesService,
        ctx.cardsCriados,
        ctx.profundidade + 1,
        ctx.cardsAtualizados,
        ctx.emailsEnfileirados,
      );
      return { cardId: cardAlvo.id, camposAtualizados: chavesAlteradas };
    },
  },

  [StepTipo.ACAO_ATUALIZAR_TITULO]: {
    ehGatilho: false,
    aliasPermissao: 'card.editar',
    validarConfig(_processoId, config) {
      if (!('titulo' in config) || !ehStringOuReferencia(config.titulo)) {
        throw new UnprocessableEntityException(
          'config.titulo é obrigatório (string ou $stepRef) para o step ACAO_ATUALIZAR_TITULO',
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { titulo } = ctx.entradas as { titulo: string };
      const tituloAntigo = ctx.card.titulo;
      ctx.card.titulo = titulo;
      await ctx.manager.save(ctx.card);
      ctx.cardsAtualizados?.set(ctx.card.id, ctx.card);
      await registrarEventoCard(ctx.manager, {
        cardId: ctx.card.id,
        tipo: CardEventoTipo.TITULO_ATUALIZADO,
        ator: ctx.ator,
        dadosAntes: { titulo: tituloAntigo },
        dadosDepois: { titulo },
      });
      return { tituloAntigo, tituloNovo: titulo };
    },
  },

  [StepTipo.ACAO_CRIAR_CARD_FILHO]: {
    ehGatilho: false,
    aliasPermissao: 'card.criar',
    async validarConfig(processoId, config, deps: DepsValidacaoStep) {
      if (typeof config?.conexaoId !== 'string' || !config.conexaoId.trim()) {
        throw new UnprocessableEntityException(
          'config.conexaoId é obrigatório (string) para o step ACAO_CRIAR_CARD_FILHO',
        );
      }
      const conexao = await deps.processoConexaoRepository.findOne({
        where: { id: config.conexaoId, processoOrigemId: processoId },
      });
      if (!conexao) {
        throw new NotFoundException(
          'Conexão informada em config.conexaoId não encontrada neste processo',
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { conexaoId, titulo } = ctx.entradas as {
        conexaoId: string;
        titulo?: string;
      };
      const conexao = await ctx.manager.findOne(ProcessoConexao, {
        where: { id: conexaoId, processoOrigemId: ctx.card.processoId },
      });
      if (!conexao || !conexao.ativo || ctx.card.filhos[conexao.posicao]) {
        return { criado: false };
      }

      const filho = await criarCardEmFase(
        ctx.manager,
        ctx.automacoesService,
        ctx.integracoesService,
        {
          processoId: conexao.processoDestinoId,
          titulo: titulo || ctx.card.titulo,
        },
        ctx.ator,
        ctx.cardsCriados,
        ctx.profundidade + 1,
        ctx.cardsAtualizados,
      );
      filho.paiCardId = ctx.card.id;
      filho.paiConexaoId = conexao.id;
      await ctx.manager.save(filho);

      const filhos = [...ctx.card.filhos];
      filhos[conexao.posicao] = filho.id;
      ctx.card.filhos = filhos;
      await ctx.manager.save(ctx.card);
      ctx.cardsAtualizados?.set(ctx.card.id, ctx.card);

      return { criado: true, cardFilhoId: filho.id, titulo: filho.titulo };
    },
  },

  [StepTipo.ACAO_MOVER_CARD_PAI]: {
    ehGatilho: false,
    aliasPermissao: 'card.mover',
    validarConfig(_processoId, config) {
      if (
        typeof config?.faseDestinoId !== 'string' ||
        !config.faseDestinoId.trim()
      ) {
        throw new UnprocessableEntityException(
          'config.faseDestinoId é obrigatório (string) para o step ACAO_MOVER_CARD_PAI',
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { faseDestinoId } = ctx.entradas as { faseDestinoId: string };
      if (!ctx.card.paiCardId) {
        return { movido: false };
      }
      const cardPai = await ctx.manager.findOne(Card, {
        where: { id: ctx.card.paiCardId },
      });
      if (!cardPai) {
        return { movido: false };
      }
      await moverCardParaFase(
        ctx.manager,
        ctx.automacoesService,
        ctx.integracoesService,
        cardPai,
        faseDestinoId,
        ctx.ator,
        ctx.cardsCriados,
        ctx.profundidade + 1,
        ctx.cardsAtualizados,
      );
      return { movido: true, cardId: cardPai.id, faseDestinoId };
    },
  },

  [StepTipo.ACAO_MOVER_CARD_FILHO]: {
    ehGatilho: false,
    aliasPermissao: 'card.mover',
    async validarConfig(processoId, config, deps: DepsValidacaoStep) {
      if (typeof config?.conexaoId !== 'string' || !config.conexaoId.trim()) {
        throw new UnprocessableEntityException(
          'config.conexaoId é obrigatório (string) para o step ACAO_MOVER_CARD_FILHO',
        );
      }
      if (
        typeof config?.faseDestinoId !== 'string' ||
        !config.faseDestinoId.trim()
      ) {
        throw new UnprocessableEntityException(
          'config.faseDestinoId é obrigatório (string) para o step ACAO_MOVER_CARD_FILHO',
        );
      }
      const conexao = await deps.processoConexaoRepository.findOne({
        where: { id: config.conexaoId, processoOrigemId: processoId },
      });
      if (!conexao) {
        throw new NotFoundException(
          'Conexão informada em config.conexaoId não encontrada neste processo',
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { conexaoId, faseDestinoId } = ctx.entradas as {
        conexaoId: string;
        faseDestinoId: string;
      };
      const conexao = await ctx.manager.findOne(ProcessoConexao, {
        where: { id: conexaoId, processoOrigemId: ctx.card.processoId },
      });
      const filhoId = conexao ? ctx.card.filhos[conexao.posicao] : null;
      if (!filhoId) {
        return { movido: false };
      }
      const cardFilho = await ctx.manager.findOne(Card, {
        where: { id: filhoId },
      });
      if (!cardFilho) {
        return { movido: false };
      }
      await moverCardParaFase(
        ctx.manager,
        ctx.automacoesService,
        ctx.integracoesService,
        cardFilho,
        faseDestinoId,
        ctx.ator,
        ctx.cardsCriados,
        ctx.profundidade + 1,
        ctx.cardsAtualizados,
      );
      return { movido: true, cardId: cardFilho.id, faseDestinoId };
    },
  },

  [StepTipo.ACAO_MOVER_CARD_ATUAL]: {
    ehGatilho: false,
    aliasPermissao: 'card.mover',
    async validarConfig(processoId, config, deps: DepsValidacaoStep) {
      if (
        typeof config?.faseDestinoId !== 'string' ||
        !config.faseDestinoId.trim()
      ) {
        throw new UnprocessableEntityException(
          'config.faseDestinoId é obrigatório (string) para o step ACAO_MOVER_CARD_ATUAL',
        );
      }
      const fase = await deps.faseRepository.findOne({
        where: { id: config.faseDestinoId, processoId },
      });
      if (!fase) {
        throw new NotFoundException(
          'Fase informada em config.faseDestinoId não encontrada neste processo',
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { faseDestinoId } = ctx.entradas as { faseDestinoId: string };
      await moverCardParaFase(
        ctx.manager,
        ctx.automacoesService,
        ctx.integracoesService,
        ctx.card,
        faseDestinoId,
        ctx.ator,
        ctx.cardsCriados,
        ctx.profundidade + 1,
        ctx.cardsAtualizados,
      );
      return { movido: true, cardId: ctx.card.id, faseDestinoId };
    },
  },

  [StepTipo.CONSULTA_CARD]: {
    ehGatilho: false,
    aliasPermissao: 'card.visualizar',
    // O card consultado pode ser de outro processo (ex.: card pai/filho via
    // ProcessoConexao) — só se sabe qual em tempo de execução, então a
    // checagem de permissão roda aqui dentro, não no motor.
    permissaoNoExecutor: true,
    validarConfig(_processoId, config) {
      if (!('cardId' in config) || !ehStringOuReferencia(config.cardId)) {
        throw new UnprocessableEntityException(
          'config.cardId é obrigatório (string ou $stepRef) para o step CONSULTA_CARD',
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { cardId } = ctx.entradas as { cardId: string };
      const cardConsultado = await ctx.manager.findOne(Card, {
        where: { id: cardId },
      });
      if (!cardConsultado) {
        throw new NotFoundException(
          `Card referenciado em config.cardId (${cardId}) não encontrado`,
        );
      }
      const permitido = await ctx.integracoesService.verificarPermissaoServico(
        ctx.step.usuarioServicoId!,
        'card.visualizar',
        cardConsultado.processoId,
      );
      if (!permitido) {
        throw new ForbiddenException(
          `Conta de serviço do step "${ctx.step.apelido}" sem permissão: card.visualizar`,
        );
      }
      return {
        cardId: cardConsultado.id,
        titulo: cardConsultado.titulo,
        campos: cardConsultado.campos,
        processoId: cardConsultado.processoId,
        faseAtualId: cardConsultado.faseAtualId,
        paiCardId: cardConsultado.paiCardId,
        paiConexaoId: cardConsultado.paiConexaoId,
        filhos: cardConsultado.filhos,
        createdAt: cardConsultado.createdAt.toISOString(),
        updatedAt: cardConsultado.updatedAt.toISOString(),
      };
    },
  },

  [StepTipo.CONSULTA_FORMULARIO_CARD]: {
    ehGatilho: false,
    aliasPermissao: 'card.visualizar',
    permissaoNoExecutor: true,
    validarConfig(_processoId, config) {
      if (!('cardId' in config) || !ehStringOuReferencia(config.cardId)) {
        throw new UnprocessableEntityException(
          'config.cardId é obrigatório (string ou $stepRef) para o step CONSULTA_FORMULARIO_CARD',
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { cardId } = ctx.entradas as { cardId: string };
      const cardConsultado = await ctx.manager.findOne(Card, {
        where: { id: cardId },
      });
      if (!cardConsultado) {
        throw new NotFoundException(
          `Card referenciado em config.cardId (${cardId}) não encontrado`,
        );
      }
      const permitido = await ctx.integracoesService.verificarPermissaoServico(
        ctx.step.usuarioServicoId!,
        'card.visualizar',
        cardConsultado.processoId,
      );
      if (!permitido) {
        throw new ForbiddenException(
          `Conta de serviço do step "${ctx.step.apelido}" sem permissão: card.visualizar`,
        );
      }
      const processo = await ctx.manager.findOne(Processo, {
        where: { id: cardConsultado.processoId },
      });
      const fases = await ctx.manager.find(Fase, {
        where: { processoId: cardConsultado.processoId },
        order: { ordem: 'ASC' },
      });
      // Combina formularioEntrada com formularioFase de todas as fases do
      // processo, nessa ordem — primeira ocorrência de cada chave vence em
      // caso de colisão de id entre formulários diferentes.
      const definicoes: CampoFormulario[] = [];
      const vistos = new Set<string>();
      for (const campoDef of [
        ...(processo?.formularioEntrada ?? []),
        ...fases.flatMap((fase) => fase.formularioFase),
      ]) {
        if (vistos.has(campoDef.id)) continue;
        vistos.add(campoDef.id);
        definicoes.push(campoDef);
      }
      const campos = definicoes.map((campoDef) => ({
        id: campoDef.id,
        rotulo: campoDef.rotulo,
        valor: cardConsultado.campos[campoDef.id] ?? null,
      }));
      return { cardId: cardConsultado.id, campos };
    },
  },

  [StepTipo.CODIGO_JAVASCRIPT]: {
    ehGatilho: false,
    aliasPermissao: 'integracao.executar_codigo',
    async validarConfig(_processoId, config) {
      if (typeof config?.codigo !== 'string' || !config.codigo.trim()) {
        throw new UnprocessableEntityException(
          'config.codigo é obrigatório (string) para o step CODIGO_JAVASCRIPT',
        );
      }
      try {
        const isolate = new ivm.Isolate({
          memoryLimit: MEMORY_LIMIT_MB_CODIGO_JAVASCRIPT,
        });
        try {
          await isolate.compileScript(`(function () {\n${config.codigo}\n})()`);
        } finally {
          isolate.dispose();
        }
      } catch (erro) {
        throw new UnprocessableEntityException(
          `config.codigo tem erro de sintaxe: ${(erro as Error).message}`,
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { codigo, ...entradasSemCodigo } = ctx.entradas as {
        codigo: string;
        [chave: string]: unknown;
      };
      return rodarCodigoJavascript(codigo, entradasSemCodigo, ctx.card.campos);
    },
  },

  [StepTipo.CONDICAO]: {
    ehGatilho: false,
    aliasPermissao: 'integracao.avaliar_condicao',
    validarConfig(_processoId, config) {
      if (!('atributo' in config) || !ehStringOuReferencia(config.atributo)) {
        throw new UnprocessableEntityException(
          'config.atributo é obrigatório (string ou $stepRef) para o step CONDICAO',
        );
      }
      if (
        typeof config?.tipoDado !== 'string' ||
        !Object.values(CondicaoTipoDado).includes(
          config.tipoDado as CondicaoTipoDado,
        )
      ) {
        throw new UnprocessableEntityException(
          `config.tipoDado deve ser um de: ${Object.values(CondicaoTipoDado).join(', ')}`,
        );
      }
      const tipoDado = config.tipoDado as CondicaoTipoDado;

      if (!Array.isArray(config.ramos) || config.ramos.length === 0) {
        throw new UnprocessableEntityException(
          'config.ramos é obrigatório (array não vazio) para o step CONDICAO',
        );
      }

      const idsVistos = new Set<string>();
      for (const ramo of config.ramos as Record<string, unknown>[]) {
        if (typeof ramo?.id !== 'string' || !ramo.id.trim()) {
          throw new UnprocessableEntityException(
            'Cada ramo de config.ramos precisa de um "id" (string)',
          );
        }
        if (ramo.id === RAMO_CONDICAO_SENAO) {
          throw new UnprocessableEntityException(
            `"${RAMO_CONDICAO_SENAO}" é reservado para o ramo padrão implícito e não pode ser usado como id em config.ramos`,
          );
        }
        if (idsVistos.has(ramo.id)) {
          throw new UnprocessableEntityException(
            `Id de ramo duplicado em config.ramos: "${ramo.id}"`,
          );
        }
        idsVistos.add(ramo.id);

        const operador = ramo.operador as CondicaoOperador;
        if (!OPERADORES_POR_TIPO_DADO[tipoDado]?.includes(operador)) {
          throw new UnprocessableEntityException(
            `Operador "${operador}" inválido para tipoDado ${tipoDado} (ramo "${ramo.id}")`,
          );
        }
        if (!OPERADORES_SEM_VALOR.has(operador) && !('valor' in ramo)) {
          throw new UnprocessableEntityException(
            `Ramo "${ramo.id}" precisa de "valor" para o operador ${operador}`,
          );
        }
        if (
          OPERADORES_COM_VALOR_FINAL.has(operador) &&
          !('valorFinal' in ramo)
        ) {
          throw new UnprocessableEntityException(
            `Ramo "${ramo.id}" precisa de "valorFinal" para o operador ${operador} (comparação "entre")`,
          );
        }
      }
    },
    executar(ctx) {
      exigirServiceAccount(ctx);
      const { atributo, tipoDado, ramos } = ctx.entradas as {
        atributo: unknown;
        tipoDado: CondicaoTipoDado;
        ramos: RegraCondicao[];
      };
      const ramoAtivo = avaliarCondicao(atributo, tipoDado, ramos);
      return { ramoAtivo, valorAvaliado: atributo };
    },
  },

  // Não decide sozinho como repetir — só valida/expõe `quantidade`. Quem
  // efetivamente repete o corpo (tudo alcançável a partir deste step) é o
  // orquestrador (ver executarSequencia em integracoes.service.ts), do mesmo
  // jeito que CONDICAO só calcula ramoAtivo e o orquestrador decide quais
  // arestas ativar.
  [StepTipo.REPETICAO]: {
    ehGatilho: false,
    aliasPermissao: 'integracao.repetir',
    validarConfig(_processoId, config) {
      if (
        typeof config?.quantidade !== 'number' ||
        !Number.isInteger(config.quantidade) ||
        config.quantidade < 1
      ) {
        throw new UnprocessableEntityException(
          'config.quantidade é obrigatório (inteiro >= 1) para o step REPETICAO',
        );
      }
      if (config.quantidade > MAX_ITERACOES_REPETICAO) {
        throw new UnprocessableEntityException(
          `config.quantidade não pode passar de ${MAX_ITERACOES_REPETICAO}`,
        );
      }
      if ('delayMs' in config) {
        if (
          typeof config.delayMs !== 'number' ||
          !Number.isInteger(config.delayMs) ||
          config.delayMs < 0
        ) {
          throw new UnprocessableEntityException(
            'config.delayMs deve ser um inteiro >= 0 (em milissegundos) quando informado',
          );
        }
        if (config.delayMs > MAX_DELAY_MS_REPETICAO) {
          throw new UnprocessableEntityException(
            `config.delayMs não pode passar de ${MAX_DELAY_MS_REPETICAO}`,
          );
        }
      }
      const delayMs =
        (config.delayMs as number | undefined) ?? DELAY_MS_PADRAO_REPETICAO;
      const atrasoTotal = (config.quantidade - 1) * delayMs;
      if (atrasoTotal > MAX_ATRASO_TOTAL_MS_REPETICAO) {
        throw new UnprocessableEntityException(
          `(quantidade - 1) x delayMs não pode passar de ${MAX_ATRASO_TOTAL_MS_REPETICAO}ms (hoje ${atrasoTotal}ms) — reduza quantidade ou delayMs`,
        );
      }
    },
    executar(ctx) {
      exigirServiceAccount(ctx);
      const { quantidade, delayMs } = ctx.entradas as {
        quantidade: number;
        delayMs?: number;
      };
      return { quantidade, delayMs: delayMs ?? DELAY_MS_PADRAO_REPETICAO };
    },
  },

  [StepTipo.HTTP_REQUEST]: {
    ehGatilho: false,
    aliasPermissao: 'integracao.executar_http',
    validarConfig(_processoId, config) {
      if (!('url' in config) || !ehStringOuReferencia(config.url)) {
        throw new UnprocessableEntityException(
          'config.url é obrigatório (string ou $stepRef) para o step HTTP_REQUEST',
        );
      }
      // Só dá pra validar o protocolo aqui quando a url já é um literal —
      // se for $stepRef, o valor real só existe em tempo de execução
      // (executar() faz a mesma checagem de novo nesse caso).
      if (typeof config.url === 'string') {
        validarProtocoloUrl(config.url);
      }
      if (
        typeof config?.metodo !== 'string' ||
        !Object.values(HttpMetodo).includes(config.metodo as HttpMetodo)
      ) {
        throw new UnprocessableEntityException(
          `config.metodo deve ser um de: ${Object.values(HttpMetodo).join(', ')}`,
        );
      }
      const metodo = config.metodo as HttpMetodo;

      if (config.headers !== undefined) {
        if (
          typeof config.headers !== 'object' ||
          config.headers === null ||
          Array.isArray(config.headers)
        ) {
          throw new UnprocessableEntityException(
            'config.headers deve ser um objeto (chave: valor) quando informado',
          );
        }
      }

      if (config.body !== undefined && METODOS_SEM_BODY.has(metodo)) {
        throw new UnprocessableEntityException(
          `config.body não é permitido com o método ${metodo}`,
        );
      }

      if (config.timeoutMs !== undefined) {
        if (typeof config.timeoutMs !== 'number' || config.timeoutMs <= 0) {
          throw new UnprocessableEntityException(
            'config.timeoutMs deve ser um número positivo quando informado',
          );
        }
        if (config.timeoutMs > HTTP_TIMEOUT_MAXIMO_MS) {
          throw new UnprocessableEntityException(
            `config.timeoutMs não pode passar de ${HTTP_TIMEOUT_MAXIMO_MS}ms`,
          );
        }
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { url, metodo, headers, body, timeoutMs } = ctx.entradas as {
        url: string;
        metodo: HttpMetodo;
        headers?: Record<string, unknown>;
        body?: unknown;
        timeoutMs?: number;
      };

      const urlValida = validarProtocoloUrl(url);

      const headersFinal: Record<string, string> = {};
      for (const [chave, valor] of Object.entries(headers ?? {})) {
        headersFinal[chave] = String(valor);
      }

      let bodyFinal: string | undefined;
      if (body !== undefined) {
        if (typeof body === 'string') {
          bodyFinal = body;
        } else {
          bodyFinal = JSON.stringify(body);
          if (
            !Object.keys(headersFinal).some(
              (h) => h.toLowerCase() === 'content-type',
            )
          ) {
            headersFinal['Content-Type'] = 'application/json';
          }
        }
      }

      const timeout = Math.min(
        timeoutMs ?? HTTP_TIMEOUT_PADRAO_MS,
        HTTP_TIMEOUT_MAXIMO_MS,
      );
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      let response: Response;
      try {
        response = await fetch(urlValida, {
          method: metodo,
          headers: headersFinal,
          body: bodyFinal,
          signal: controller.signal,
        });
      } catch (erro) {
        if ((erro as Error).name === 'AbortError') {
          throw new UnprocessableEntityException(
            `Requisição excedeu o timeout de ${timeout}ms`,
          );
        }
        throw new UnprocessableEntityException(
          `Falha ao chamar ${urlValida.toString()}: ${(erro as Error).message}`,
        );
      } finally {
        clearTimeout(timer);
      }

      const textoResposta = await lerCorpoComLimite(
        response,
        HTTP_TAMANHO_MAXIMO_RESPOSTA_BYTES,
      );
      const contentType = response.headers.get('content-type') ?? '';
      let corpo: unknown = textoResposta;
      if (contentType.includes('application/json') && textoResposta.trim()) {
        try {
          corpo = JSON.parse(textoResposta);
        } catch {
          corpo = textoResposta;
        }
      }

      const headersResposta: Record<string, string> = {};
      response.headers.forEach((valor, chave) => {
        headersResposta[chave] = valor;
      });

      return {
        statusCode: response.status,
        sucesso: response.ok,
        headers: headersResposta,
        corpo,
      };
    },
  },

  // Terminal (ver STEP_TIPOS_TERMINAL): só enfileira — o envio de verdade
  // roda fora desta transação, num worker BullMQ (ver src/email). A "saída"
  // deste step é só a confirmação de enfileiramento, nunca a resposta real
  // do envio.
  [StepTipo.EMAIL]: {
    ehGatilho: false,
    aliasPermissao: 'integracao.enviar_email',
    async validarConfig(_processoId, config, deps: DepsValidacaoStep) {
      if (typeof config?.provedorId !== 'string' || !config.provedorId.trim()) {
        throw new UnprocessableEntityException(
          'config.provedorId é obrigatório (string) para o step EMAIL',
        );
      }
      const existe = await deps.emailService.provedorExiste(config.provedorId);
      if (!existe) {
        throw new NotFoundException(
          'Provedor informado em config.provedorId não encontrado',
        );
      }
      if (!ehStringOuReferencia(config.destinatarios)) {
        throw new UnprocessableEntityException(
          'config.destinatarios é obrigatório (string ou $stepRef) para o step EMAIL',
        );
      }
      if (config.cc !== undefined && !ehStringOuReferencia(config.cc)) {
        throw new UnprocessableEntityException(
          'config.cc deve ser string ou $stepRef quando informado',
        );
      }
      if (!ehStringOuReferencia(config.assunto)) {
        throw new UnprocessableEntityException(
          'config.assunto é obrigatório (string ou $stepRef) para o step EMAIL',
        );
      }
      if (!ehStringOuReferencia(config.corpo)) {
        throw new UnprocessableEntityException(
          'config.corpo é obrigatório (string ou $stepRef) para o step EMAIL',
        );
      }
      // Aceita a chave inteira como $stepRef (ex.: o `anexoIds` de um
      // ACAO_ANEXAR_ARQUIVO anterior) ou um array cujos itens são uuid
      // literal ou $stepRef individual (ex.: o id de um anexo devolvido por
      // um CODIGO_JAVASCRIPT).
      if (
        config.anexoIds !== undefined &&
        !ehReferenciaStep(config.anexoIds) &&
        (!Array.isArray(config.anexoIds) ||
          config.anexoIds.some((id) => !ehStringOuReferencia(id)))
      ) {
        throw new UnprocessableEntityException(
          'config.anexoIds deve ser um $stepRef ou um array de string (uuid) / $stepRef quando informado',
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { provedorId, destinatarios, cc, assunto, corpo, anexoIds } =
        ctx.entradas as {
          provedorId: string;
          destinatarios: string;
          cc?: string;
          assunto: string;
          corpo: string;
          anexoIds?: unknown;
        };

      // Depois da resolução, cada item pode ter vindo de um $stepRef: uma
      // string (id único), um array (ex.: anexoIds de ANEXAR_ARQUIVO,
      // achatado aqui) ou null (step/campo referenciado sem saída). null ou
      // qualquer coisa que não seja string derruba o step em vez de mandar o
      // email sem o anexo em silêncio.
      const idsSolicitados =
        anexoIds === undefined
          ? []
          : Array.isArray(anexoIds)
            ? anexoIds.flat()
            : [anexoIds];
      const anexosResolvidos: AnexoEmailEnvio[] = [];
      for (const anexoId of idsSolicitados) {
        if (typeof anexoId !== 'string' || !anexoId.trim()) {
          throw new UnprocessableEntityException(
            'config.anexoIds resolveu para um valor que não é id de anexo (a referência aponta pra um step/campo que não devolveu o id?)',
          );
        }
        const anexo = await ctx.manager.findOne(CardAnexo, {
          where: { id: anexoId, cardId: ctx.card.id },
        });
        if (!anexo) {
          throw new NotFoundException(
            `Anexo "${anexoId}" referenciado em config.anexoIds não encontrado neste card`,
          );
        }
        anexosResolvidos.push({
          nome: anexo.nomeOriginal,
          objectKey: anexo.objectKey,
          mimeType: anexo.mimeType,
        });
      }

      const envio = await ctx.emailService.enfileirarEnvio(ctx.manager, {
        provedorId,
        destinatarios: parseListaEmails(destinatarios),
        cc: parseListaEmails(cc),
        assunto,
        corpoHtml: corpo,
        anexos: anexosResolvidos,
        cardId: ctx.card.id,
        integracaoId: ctx.step.integracaoId,
        stepApelido: ctx.step.apelido,
      });
      ctx.emailsEnfileirados?.push(envio.id);

      return { envioId: envio.id, status: envio.status };
    },
  },

  // Step NOTIFICACAO: emite um alerta em tempo real pro front do processo
  // (ver RealtimeGateway.emitirNotificacao) — não mexe no card, não tem
  // "entrada" no sentido de dado consumido, só produz o efeito colateral de
  // notificação. Roda de forma síncrona (diferente de EMAIL): o conteúdo já
  // sai pronto (sanitizado, se HTML) na própria execução, por isso não é
  // terminal e pode alimentar outro step com sua saída.
  [StepTipo.NOTIFICACAO]: {
    ehGatilho: false,
    aliasPermissao: 'integracao.emitir_notificacao',
    validarConfig(_processoId, config) {
      if (
        typeof config?.tipo !== 'string' ||
        !Object.values(NotificacaoTipo).includes(config.tipo as NotificacaoTipo)
      ) {
        throw new UnprocessableEntityException(
          `config.tipo é obrigatório para o step NOTIFICACAO e deve ser um de: ${Object.values(NotificacaoTipo).join(', ')}`,
        );
      }
      if (
        typeof config?.tamanho !== 'string' ||
        !Object.values(NotificacaoTamanho).includes(
          config.tamanho as NotificacaoTamanho,
        )
      ) {
        throw new UnprocessableEntityException(
          `config.tamanho é obrigatório para o step NOTIFICACAO e deve ser um de: ${Object.values(NotificacaoTamanho).join(', ')}`,
        );
      }
      if (
        typeof config?.formato !== 'string' ||
        !Object.values(NotificacaoFormato).includes(
          config.formato as NotificacaoFormato,
        )
      ) {
        throw new UnprocessableEntityException(
          `config.formato é obrigatório para o step NOTIFICACAO e deve ser um de: ${Object.values(NotificacaoFormato).join(', ')}`,
        );
      }
      if (!ehStringOuReferencia(config.conteudo)) {
        throw new UnprocessableEntityException(
          'config.conteudo é obrigatório (string ou $stepRef) para o step NOTIFICACAO',
        );
      }
      // Opcional: sem `som` (ou null) o alerta aparece mudo.
      if (
        config.som !== undefined &&
        config.som !== null &&
        (typeof config.som !== 'string' || !buscarSom(config.som))
      ) {
        throw new UnprocessableEntityException(
          `config.som deve ser um de: ${SONS_NOTIFICACAO.map((s) => s.id).join(', ')} (ou omitido, pra alerta sem som)`,
        );
      }
    },
    executar(ctx) {
      exigirServiceAccount(ctx);
      const { tipo, tamanho, formato, conteudo, som } = ctx.entradas as {
        tipo: NotificacaoTipo;
        tamanho: NotificacaoTamanho;
        formato: NotificacaoFormato;
        conteudo: string;
        som?: string | null;
      };

      // Sanitização acontece aqui, não no front: conteudo pode ter vindo de
      // $stepRef de um HTTP_REQUEST (API externa) ou de um CODIGO_JAVASCRIPT
      // — nunca é seguro confiar nesse texto sem passar por allowlist antes
      // de qualquer front inserir via innerHTML.
      const conteudoFinal =
        formato === NotificacaoFormato.HTML
          ? sanitizarHtml(conteudo)
          : conteudo;

      const notificacao = {
        processoId: ctx.card.processoId,
        cardId: ctx.card.id,
        tipo,
        tamanho,
        formato,
        conteudo: conteudoFinal,
        som: som ?? null,
      };
      ctx.notificacoesEnfileiradas?.push(notificacao);

      return {
        tipo,
        tamanho,
        formato,
        conteudo: conteudoFinal,
        som: som ?? null,
      };
    },
  },

  // Anexa 1 a 5 arquivos fixos (cadastrados no step) no card que disparou a
  // execução — pensado pra documento repetitivo ("entrou na fase B, anexa o
  // termo padrão"). Cada arquivo é COPIADO (nunca referenciado — ver
  // StorageService.copiar) pra um objectKey novo por execução, e vira um
  // CardAnexo de verdade: aparece na listagem geral de anexos do card
  // (GET .../cards/:id/anexos) e no histórico (ANEXO_ADICIONADO), sem
  // distinção visual de "veio de automação" além de `automatico` no evento.
  // Não é terminal (ver STEP_TIPOS_TERMINAL): a cópia é síncrona, então o
  // resultado (anexoIds) já está pronto pros steps a jusante.
  [StepTipo.ACAO_ANEXAR_ARQUIVO]: {
    ehGatilho: false,
    aliasPermissao: 'integracao.anexar_arquivo',
    validarConfig(_processoId, config) {
      if (!Array.isArray(config?.arquivos) || config.arquivos.length === 0) {
        throw new UnprocessableEntityException(
          `config.arquivos é obrigatório (array com 1 a ${MAX_ARQUIVOS_ACAO_ANEXAR_ARQUIVO} arquivos, ver POST .../integracoes/arquivos-step) para o step ACAO_ANEXAR_ARQUIVO`,
        );
      }
      if (config.arquivos.length > MAX_ARQUIVOS_ACAO_ANEXAR_ARQUIVO) {
        throw new UnprocessableEntityException(
          `config.arquivos aceita no máximo ${MAX_ARQUIVOS_ACAO_ANEXAR_ARQUIVO} arquivos`,
        );
      }
      if (!config.arquivos.every(ehArquivoStepReferenciaValido)) {
        throw new UnprocessableEntityException(
          'Cada item de config.arquivos precisa de objectKey, nomeOriginal, mimeType (string) e tamanho (number) — use o retorno de POST .../integracoes/arquivos-step',
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { arquivos } = ctx.entradas as {
        arquivos: ArquivoStepReferencia[];
      };

      const anexoIds: string[] = [];
      for (const arquivo of arquivos) {
        const objectKeyDestino = `cards/${ctx.card.id}/${randomUUID()}-${arquivo.nomeOriginal}`;
        await ctx.storageService.copiar(arquivo.objectKey, objectKeyDestino);

        const anexo = await ctx.manager.save(
          ctx.manager.create(CardAnexo, {
            cardId: ctx.card.id,
            nomeOriginal: arquivo.nomeOriginal,
            objectKey: objectKeyDestino,
            mimeType: arquivo.mimeType,
            tamanho: arquivo.tamanho,
          }),
        );
        await registrarEventoCard(ctx.manager, {
          cardId: ctx.card.id,
          tipo: CardEventoTipo.ANEXO_ADICIONADO,
          ator: ctx.ator,
          dadosDepois: { anexoId: anexo.id, nomeOriginal: anexo.nomeOriginal },
        });
        anexoIds.push(anexo.id);
      }

      return { anexoIds, quantidade: anexoIds.length };
    },
  },

  // Emite um PDF do card a partir de um PdfModelo do processo. Síncrono:
  // renderiza aqui mesmo (Puppeteer, com timeout de 15s e no máximo 3
  // renderizações simultâneas no servidor — ver PdfRendererService) dentro da
  // transação da cadeia. Falha (modelo com HTML quebrado, timeout, fila
  // cheia) desfaz a cadeia inteira, igual qualquer outro step. O CardAnexo
  // criado é o que um step EMAIL a jusante anexa via $stepRef -> anexoId.
  // modeloId é sempre literal: validado contra o processo já na criação da
  // integração (mesma razão de faseId/conexaoId).
  [StepTipo.ACAO_EMITIR_PDF]: {
    ehGatilho: false,
    aliasPermissao: 'pdfModelo.emitir',
    async validarConfig(processoId, config, deps: DepsValidacaoStep) {
      if (typeof config?.modeloId !== 'string' || !config.modeloId.trim()) {
        throw new UnprocessableEntityException(
          'config.modeloId é obrigatório (string, uuid de um modelo de PDF do processo) para o step ACAO_EMITIR_PDF',
        );
      }
      const modelo = await deps.pdfModeloRepository.findOne({
        where: { id: config.modeloId, processoId },
      });
      if (!modelo) {
        throw new NotFoundException(
          'Modelo informado em config.modeloId não encontrado neste processo',
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { modeloId } = ctx.entradas as { modeloId: string };
      return ctx.cardPdfEmissaoService.emitirNoStep(
        ctx.manager,
        ctx.card.id,
        modeloId,
        ctx.ator,
      );
    },
  },

  // Aplica etiquetas do processo no card. ADICIONAR soma às atuais (o que o
  // card já tem não é tocado); SUBSTITUIR limpa tudo e deixa só as do step.
  // Roda na transação da cadeia: se uma etiqueta configurada foi apagada
  // depois de o step ser salvo, falha e desfaz a cadeia inteira (mesma regra
  // de qualquer outro step). etiquetaIds/modo são sempre literais, validados
  // contra o processo na criação da integração.
  [StepTipo.ACAO_APLICAR_ETIQUETA]: {
    ehGatilho: false,
    aliasPermissao: 'card.editar',
    async validarConfig(processoId, config, deps: DepsValidacaoStep) {
      const { etiquetaIds, modo } = config ?? {};
      if (
        !Array.isArray(etiquetaIds) ||
        etiquetaIds.length === 0 ||
        !etiquetaIds.every(
          (id) => typeof id === 'string' && REGEX_UUID.test(id),
        )
      ) {
        throw new UnprocessableEntityException(
          'config.etiquetaIds é obrigatório (array com 1 ou mais uuids de etiquetas do processo) para o step ACAO_APLICAR_ETIQUETA',
        );
      }
      if (new Set(etiquetaIds).size !== etiquetaIds.length) {
        throw new UnprocessableEntityException(
          'config.etiquetaIds não pode ter ids repetidos',
        );
      }
      if (
        typeof modo !== 'string' ||
        !Object.values(ModoAplicarEtiqueta).includes(
          modo as ModoAplicarEtiqueta,
        )
      ) {
        throw new UnprocessableEntityException(
          `config.modo é obrigatório e deve ser um de: ${Object.values(ModoAplicarEtiqueta).join(', ')}`,
        );
      }

      const ids = etiquetaIds as string[];
      const existentes = await deps.etiquetaRepository.find({
        where: { id: In(ids), processoId },
        select: { id: true },
      });
      const idsExistentes = new Set(existentes.map((e) => e.id));
      const faltando = ids.filter((id) => !idsExistentes.has(id));
      if (faltando.length > 0) {
        throw new NotFoundException(
          `Etiqueta(s) de config.etiquetaIds não encontrada(s) neste processo: ${faltando.join(', ')}`,
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { etiquetaIds, modo } = ctx.entradas as {
        etiquetaIds: string[];
        modo: ModoAplicarEtiqueta;
      };

      const atuais = await listarEtiquetasDoCard(ctx.manager, ctx.card.id);
      const idsFinais =
        modo === ModoAplicarEtiqueta.SUBSTITUIR
          ? etiquetaIds
          : [...atuais.map((e) => e.id), ...etiquetaIds];

      const resultado = await definirEtiquetasDoCard(
        ctx.manager,
        ctx.card,
        idsFinais,
        ctx.ator,
      );

      if (resultado.adicionadas.length > 0 || resultado.removidas.length > 0) {
        ctx.card.etiquetas = resultado.etiquetas;
        ctx.cardsAtualizados?.set(ctx.card.id, ctx.card);
      }
      return {
        adicionadas: resultado.adicionadas,
        removidas: resultado.removidas,
        etiquetaIds: resultado.etiquetas.map((e) => e.id),
      };
    },
  },

  // Define o vencimento do card: RELATIVO (agora + dias×24h + horas) ou
  // ABSOLUTO (dataHora ISO — aceita {chave} do card e $stepRef, então dá pra
  // vir de um campo do formulário). Sobrescreve o vencimento atual. Mudar a
  // data permite os gatilhos de vencimento dispararem de novo na data nova.
  [StepTipo.ACAO_DEFINIR_VENCIMENTO]: {
    ehGatilho: false,
    aliasPermissao: 'card.editar',
    validarConfig(_processoId, config) {
      const { modo } = config ?? {};
      if (
        typeof modo !== 'string' ||
        !(MODOS_DEFINIR_VENCIMENTO as readonly string[]).includes(modo)
      ) {
        throw new UnprocessableEntityException(
          `config.modo é obrigatório e deve ser um de: ${MODOS_DEFINIR_VENCIMENTO.join(', ')}`,
        );
      }
      if (modo === 'RELATIVO') {
        const dias = config.dias ?? 0;
        const horas = config.horas ?? 0;
        if (
          !Number.isInteger(dias) ||
          !Number.isInteger(horas) ||
          (dias as number) < 0 ||
          (horas as number) < 0 ||
          (dias as number) + (horas as number) <= 0
        ) {
          throw new UnprocessableEntityException(
            'No modo RELATIVO, config.dias e config.horas devem ser inteiros >= 0 e ao menos um deles maior que zero',
          );
        }
        return;
      }
      if (!('dataHora' in config) || !ehStringOuReferencia(config.dataHora)) {
        throw new UnprocessableEntityException(
          'No modo ABSOLUTO, config.dataHora é obrigatório (string ISO 8601 ou $stepRef)',
        );
      }
      // Literal sem placeholder: dá pra validar já ao salvar.
      if (
        typeof config.dataHora === 'string' &&
        !config.dataHora.includes('{') &&
        Number.isNaN(new Date(config.dataHora).getTime())
      ) {
        throw new UnprocessableEntityException(
          'config.dataHora não é uma data/hora válida (use ISO 8601, ex.: 2026-09-25T20:00:00Z)',
        );
      }
    },
    async executar(ctx) {
      exigirServiceAccount(ctx);
      const { modo, dias, horas, dataHora } = ctx.entradas as {
        modo: 'RELATIVO' | 'ABSOLUTO';
        dias?: number;
        horas?: number;
        dataHora?: unknown;
      };
      const dataHoraTexto = typeof dataHora === 'string' ? dataHora : '';

      let nova: Date;
      if (modo === 'RELATIVO') {
        nova = new Date(
          Date.now() + ((dias ?? 0) * 24 + (horas ?? 0)) * MS_HORA,
        );
      } else {
        nova = new Date(dataHoraTexto);
        if (Number.isNaN(nova.getTime())) {
          throw new UnprocessableEntityException(
            `config.dataHora resolvida ("${dataHoraTexto}") não é uma data/hora válida`,
          );
        }
      }

      const anterior = ctx.card.dataVencimento;
      ctx.card.dataVencimento = nova;
      await ctx.manager.save(ctx.card);
      ctx.cardsAtualizados?.set(ctx.card.id, ctx.card);
      await registrarEventoCard(ctx.manager, {
        cardId: ctx.card.id,
        tipo: CardEventoTipo.VENCIMENTO_ATUALIZADO,
        ator: ctx.ator,
        dadosAntes: { dataVencimento: anterior?.toISOString() ?? null },
        dadosDepois: { dataVencimento: nova.toISOString() },
      });
      return {
        dataVencimentoAnterior: anterior?.toISOString() ?? null,
        dataVencimento: nova.toISOString(),
      };
    },
  },
};
