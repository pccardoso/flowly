import { EntityManager } from 'typeorm';
import { Card } from './entities/card.entity';
import { AtorEvento } from './card-evento.helper';
import { StepTipo } from '../integracoes/enums/step-tipo.enum';
import type { AutomacoesService } from '../automacoes/automacoes.service';
import type { IntegracoesService } from '../integracoes/integracoes.service';
import type { NotificacaoEnfileirada } from '../integracoes/notificacao-enfileirada.interface';

// Ponto único que dispara os dois motores de reação a evento de card (o
// motor de Automacao, enum fixo, e o motor de Integracao, grafo de steps).
// Existe pra nenhum dos dois serviços precisar importar o outro (mesmo
// motivo de criarCardEmFase/moverCardParaFase serem funções livres — ver
// card-creation.helper.ts): cada engine só recebe o outro como parâmetro
// explícito, nunca como dependência de construtor.
export async function dispararGatilhosCardEntrouNaFase(
  manager: EntityManager,
  card: Card,
  faseId: string,
  automacoesService: AutomacoesService,
  integracoesService: IntegracoesService,
  cardsCriados: Card[] | undefined,
  profundidade: number,
  cardsAtualizados: Map<string, Card> | undefined,
  emailsEnfileirados?: string[],
  notificacoesEnfileiradas?: NotificacaoEnfileirada[],
): Promise<void> {
  await automacoesService.executarGatilhoCardEntrouNaFase(
    manager,
    card,
    faseId,
    integracoesService,
    cardsCriados,
    profundidade,
    cardsAtualizados,
    emailsEnfileirados,
    notificacoesEnfileiradas,
  );
  await integracoesService.executarGatilhoCardEntrouNaFase(
    manager,
    card,
    faseId,
    automacoesService,
    cardsCriados,
    profundidade,
    cardsAtualizados,
    emailsEnfileirados,
    notificacoesEnfileiradas,
  );
}

// GATILHO_CARD_CRIADO existe só no motor de Integracao (ver comentário em
// enums/step-tipo.enum.ts) — por isso, diferente de
// dispararGatilhosCardEntrouNaFase, este chama só integracoesService.
// `ator` é o autor de verdade da criação (não um AtorEvento fixo/automático
// como no disparo de entrada de fase), porque a saída do gatilho expõe
// quem criou o card.
export async function dispararGatilhoIntegracaoCardCriado(
  manager: EntityManager,
  card: Card,
  ator: AtorEvento,
  integracoesService: IntegracoesService,
  automacoesService: AutomacoesService,
  cardsCriados: Card[] | undefined,
  profundidade: number,
  cardsAtualizados: Map<string, Card> | undefined,
  emailsEnfileirados?: string[],
  notificacoesEnfileiradas?: NotificacaoEnfileirada[],
): Promise<void> {
  await integracoesService.executarGatilhoCardCriado(
    manager,
    card,
    ator,
    automacoesService,
    cardsCriados,
    profundidade,
    cardsAtualizados,
    emailsEnfileirados,
    notificacoesEnfileiradas,
  );
}

export async function dispararGatilhosCampoAtualizado(
  manager: EntityManager,
  card: Card,
  camposAlterados: string[],
  automacoesService: AutomacoesService,
  integracoesService: IntegracoesService,
  cardsCriados: Card[] | undefined,
  profundidade: number,
  cardsAtualizados: Map<string, Card> | undefined,
  emailsEnfileirados?: string[],
  notificacoesEnfileiradas?: NotificacaoEnfileirada[],
): Promise<void> {
  await automacoesService.executarGatilhoCampoAtualizado(
    manager,
    card,
    camposAlterados,
    integracoesService,
    cardsCriados,
    profundidade,
    cardsAtualizados,
    emailsEnfileirados,
    notificacoesEnfileiradas,
  );
  await integracoesService.executarGatilhoCampoAtualizado(
    manager,
    card,
    camposAlterados,
    automacoesService,
    cardsCriados,
    profundidade,
    cardsAtualizados,
    emailsEnfileirados,
    notificacoesEnfileiradas,
  );
}

// GATILHO_CARD_VENCIDO / GATILHO_CARD_PRESTES_A_VENCER existem só no motor de
// Integracao (mesmo caso de dispararGatilhoIntegracaoCardCriado).
export async function dispararGatilhoVencimento(
  manager: EntityManager,
  card: Card,
  tipoGatilho:
    StepTipo.GATILHO_CARD_VENCIDO | StepTipo.GATILHO_CARD_PRESTES_A_VENCER,
  automacoesService: AutomacoesService,
  integracoesService: IntegracoesService,
  cardsCriados: Card[] | undefined,
  profundidade: number,
  cardsAtualizados: Map<string, Card> | undefined,
  emailsEnfileirados?: string[],
  notificacoesEnfileiradas?: NotificacaoEnfileirada[],
): Promise<void> {
  await integracoesService.executarGatilhoVencimento(
    manager,
    card,
    tipoGatilho,
    automacoesService,
    cardsCriados,
    profundidade,
    cardsAtualizados,
    emailsEnfileirados,
    notificacoesEnfileiradas,
  );
}
