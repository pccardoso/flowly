import { EntityManager, Repository } from 'typeorm';
import { Card } from '../cards/entities/card.entity';
import { Fase } from '../fases/entities/fase.entity';
import { ProcessoConexao } from '../processos/entities/processo-conexao.entity';
import { User } from '../users/entities/user.entity';
import { AtorEvento } from '../cards/card-evento.helper';
import type { AutomacoesService } from '../automacoes/automacoes.service';
import type { IntegracoesService } from './integracoes.service';
import type { EmailService } from '../email/email.service';
import type { StorageService } from '../storage/storage.service';
import type { CardPdfEmissaoService } from '../pdf-modelos/card-pdf-emissao.service';
import { PdfModelo } from '../pdf-modelos/entities/pdf-modelo.entity';
import { Etiqueta } from '../etiquetas/entities/etiqueta.entity';
import { IntegracaoStep } from './entities/integracao-step.entity';
import { NotificacaoEnfileirada } from './notificacao-enfileirada.interface';

// Repositórios que os validadores de config precisam pra checar referências
// (fase existe? conexão existe? usuário existe?) — os mesmos que
// AutomacoesService injeta hoje, só que passados explicitamente porque o
// registry (step-executors.ts) é um objeto simples, não uma classe com DI.
export interface DepsValidacaoStep {
  faseRepository: Repository<Fase>;
  processoConexaoRepository: Repository<ProcessoConexao>;
  userRepository: Repository<User>;
  emailService: EmailService;
  pdfModeloRepository: Repository<PdfModelo>;
  etiquetaRepository: Repository<Etiqueta>;
}

// Contexto passado a um StepExecutor na hora de rodar. `entradas` já vem com
// todo o `config` do step resolvido: $stepRef substituído pela saída real do
// step de origem, e string com {chave} interpolada contra card.campos (ver
// resolverConfigStep em integracao-engine.ts) — o executor nunca lida com
// referência crua.
export interface ContextoExecucaoStep {
  manager: EntityManager;
  card: Card;
  step: IntegracaoStep;
  entradas: Record<string, unknown>;
  ator: AtorEvento;
  automacoesService: AutomacoesService;
  integracoesService: IntegracoesService;
  emailService: EmailService;
  storageService: StorageService;
  cardPdfEmissaoService: CardPdfEmissaoService;
  cardsCriados?: Card[];
  cardsAtualizados?: Map<string, Card>;
  // Ids de EmailEnvio criados por um step EMAIL durante esta execução —
  // acompanha cardsCriados/cardsAtualizados na mesma cadeia de chamadas
  // (helper -> automacoes/integracoes service -> chamadas aninhadas), pra
  // quem disparou a transação enfileirar o envio de verdade (EmailService.
  // despacharEnvios) só depois do commit, nunca durante ele.
  emailsEnfileirados?: string[];
  // Notificações criadas por um step NOTIFICACAO durante esta execução —
  // mesmo padrão de emailsEnfileirados: quem disparou a transação emite via
  // RealtimeGateway.emitirNotificacao só depois do commit.
  notificacoesEnfileiradas?: NotificacaoEnfileirada[];
  profundidade: number;
}

export interface StepExecutor {
  // true para GATILHO_*: não tem entrada, não checa permissão/conta de
  // serviço, só produz a saída inicial (dados do evento) pros steps a jusante.
  ehGatilho: boolean;

  // Alias do catálogo de permissões (ver catalogo-permissoes.ts) checado
  // contra `step.usuarioServicoId` antes de executar. undefined só é válido
  // quando ehGatilho = true.
  aliasPermissao?: string;

  // true nos steps cujo processoId relevante pra checagem de permissão só se
  // sabe em tempo de execução (ex.: CONSULTA_CARD recebe um cardId dinâmico
  // que pode ser de outro processo) — nesse caso o motor NÃO faz a checagem
  // genérica contra `integracao.processoId` antes de chamar `executar`; o
  // próprio executor chama `ctx.integracoesService.verificarPermissaoServico`
  // com o processoId real depois de resolver o card. `usuarioServicoId`
  // continua sendo exigido pelo motor de qualquer forma.
  permissaoNoExecutor?: boolean;

  // void | Promise<void> (em vez de sempre Promise<void>) porque nem todo
  // tipo precisa consultar o banco pra validar — sync é permitido, quem
  // chama sempre dá `await` de qualquer forma.
  validarConfig(
    processoId: string,
    config: Record<string, unknown>,
    deps: DepsValidacaoStep,
  ): void | Promise<void>;

  // Retorna o objeto de saída deste step, disponível pros steps conectados a
  // jusante via config.$stepRef.
  executar(
    ctx: ContextoExecucaoStep,
  ): Record<string, unknown> | Promise<Record<string, unknown>>;
}
