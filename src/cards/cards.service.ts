import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Processo } from '../processos/entities/processo.entity';
import { ProcessoConexao } from '../processos/entities/processo-conexao.entity';
import { AutomacoesService } from '../automacoes/automacoes.service';
import { AutomacaoExecucao } from '../automacoes/entities/automacao-execucao.entity';
import { Card } from './entities/card.entity';
import { CardMovimentacao } from './entities/card-movimentacao.entity';
import { CardAnexo } from './entities/card-anexo.entity';
import { CardComentario } from './entities/card-comentario.entity';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardCamposDto } from './dto/update-card-campos.dto';
import { MoverCardDto } from './dto/mover-card.dto';
import { CreateCardFilhoDto } from './dto/create-card-filho.dto';
import { criarCardEmFase, moverCardParaFase } from './card-creation.helper';
import { registrarEventoCard } from './card-evento.helper';
import { CardEvento } from './entities/card-evento.entity';
import { CardEventoTipo } from './enums/card-evento-tipo.enum';
import { interpolarTemplate } from '../common/template.util';
import { montarPagina, PaginaResultado } from '../common/pagination';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { StorageService } from '../storage/storage.service';

export interface FilhoConexaoInfo {
  posicao: number;
  conexaoId: string;
  processoDestinoId: string;
  ativo: boolean;
  cardFilhoId: string | null;
  cardFilhoTitulo: string | null;
}

export interface PaiConexaoInfo {
  cardId: string;
  cardTitulo: string;
  conexaoId: string;
  processoId: string;
  posicao: number;
}

export interface ComentarioResumo {
  id: string;
  texto: string;
  criadoEm: Date;
  atualizadoEm: Date;
  usuario: { id: string; nome: string };
}

export type CardComConexoes = Omit<
  Card,
  'filhos' | 'comentarios' | 'anexos'
> & {
  pai: PaiConexaoInfo | null;
  filhos: FilhoConexaoInfo[];
  totalComentarios: number;
  totalAnexos: number;
  // Só vem preenchido no detalhe (buscarPorId); na listagem só o total conta.
  comentarios?: ComentarioResumo[];
};

@Injectable()
export class CardsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly automacoesService: AutomacoesService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly storageService: StorageService,
  ) {}

  // Emite `card:criado` (canal `processo:<processoId>`) só depois que a
  // transação que criou os cards já foi commitada — nunca durante ela.
  private notificarCardsCriados(cards: Card[]): void {
    for (const card of cards) {
      this.realtimeGateway.emitirCardCriado(card.processoId, card);
    }
  }

  // Mesmo cuidado de `notificarCardsCriados`: só chamar depois que a
  // transação que gerou as mudanças já foi commitada.
  private notificarCardsAtualizados(cards: Iterable<Card>): void {
    for (const card of cards) {
      this.realtimeGateway.emitirCardAtualizado(card.processoId, card);
    }
  }

  async listarExecucoes(cardId: string): Promise<AutomacaoExecucao[]> {
    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: cardId },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    return this.dataSource.manager.find(AutomacaoExecucao, {
      where: { cardId },
      order: { executadoEm: 'DESC' },
    });
  }

  // `tipo`, quando informado, filtra pra um único CardEventoTipo (ex.: só
  // CARD_MOVIDO, pra reconstruir o caminho percorrido pelas fases).
  async listarHistorico(
    cardId: string,
    tipo: CardEventoTipo | undefined,
    page: number,
    perPage: number,
  ): Promise<PaginaResultado<CardEvento>> {
    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: cardId },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    const [eventos, total] = await this.dataSource.manager.findAndCount(
      CardEvento,
      {
        where: tipo ? { cardId, tipo } : { cardId },
        relations: { usuario: true },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * perPage,
        take: perPage,
      },
    );
    return montarPagina(eventos, total, page, perPage);
  }

  async listarPorProcesso(processoId: string): Promise<CardComConexoes[]> {
    const processo = await this.dataSource.manager.findOne(Processo, {
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    const cards = await this.dataSource.manager.find(Card, {
      where: { processoId },
      relations: { faseAtual: true },
      order: { createdAt: 'ASC' },
    });

    return this.enriquecerComConexoes(cards, { comentariosCompletos: false });
  }

  // Paginado no estilo Laravel: já na primeira página o `meta` informa
  // `total`/`lastPage`, então o front monta a navegação sem precisar de uma
  // requisição extra — cada clique de página é só um novo `page=N`.
  async listarPorProcessoPaginado(
    processoId: string,
    page: number,
    perPage: number,
  ): Promise<PaginaResultado<CardComConexoes>> {
    const processo = await this.dataSource.manager.findOne(Processo, {
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    const [cards, total] = await this.dataSource.manager.findAndCount(Card, {
      where: { processoId },
      relations: { faseAtual: true },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    const data = await this.enriquecerComConexoes(cards, {
      comentariosCompletos: false,
    });
    return montarPagina(data, total, page, perPage);
  }

  // Anexa os blocos `pai`/`filhos` (com título dos cards conectados) a uma
  // lista de cards usando um número fixo de queries em lote, independente
  // da quantidade de cards — evita N+1 tanto na listagem quanto no detalhe.
  // `comentariosCompletos` controla se o array de comentários vem inteiro
  // (usado só no detalhe de um card) ou só a contagem (usado na listagem,
  // pra não pesar o payload do kanban com todo o histórico de comentários).
  private async enriquecerComConexoes(
    cards: Card[],
    { comentariosCompletos }: { comentariosCompletos: boolean },
  ): Promise<CardComConexoes[]> {
    if (cards.length === 0) {
      return [];
    }

    const processoIds = Array.from(new Set(cards.map((c) => c.processoId)));
    const conexoes = await this.dataSource.manager.find(ProcessoConexao, {
      where: { processoOrigemId: In(processoIds) },
      order: { posicao: 'ASC' },
    });
    const conexoesPorProcesso = new Map<string, ProcessoConexao[]>();
    for (const conexao of conexoes) {
      const lista = conexoesPorProcesso.get(conexao.processoOrigemId) ?? [];
      lista.push(conexao);
      conexoesPorProcesso.set(conexao.processoOrigemId, lista);
    }

    const paiConexaoIds = Array.from(
      new Set(
        cards
          .map((c) => c.paiConexaoId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const conexoesPai = paiConexaoIds.length
      ? await this.dataSource.manager.find(ProcessoConexao, {
          where: { id: In(paiConexaoIds) },
        })
      : [];
    const conexaoPaiPorId = new Map(conexoesPai.map((c) => [c.id, c]));

    const idsRelacionados = new Set<string>();
    for (const card of cards) {
      const conexoesDoProcesso = conexoesPorProcesso.get(card.processoId) ?? [];
      for (const conexao of conexoesDoProcesso) {
        const filhoId = card.filhos[conexao.posicao];
        if (filhoId) {
          idsRelacionados.add(filhoId);
        }
      }
      if (card.paiCardId) {
        idsRelacionados.add(card.paiCardId);
      }
    }

    const cardsRelacionados = idsRelacionados.size
      ? await this.dataSource.manager.find(Card, {
          where: { id: In([...idsRelacionados]) },
        })
      : [];
    const cardPorId = new Map(cardsRelacionados.map((c) => [c.id, c]));

    const cardIds = cards.map((c) => c.id);

    const anexos = await this.dataSource.manager.find(CardAnexo, {
      where: { cardId: In(cardIds) },
      select: { id: true, cardId: true },
    });
    const totalAnexosPorCard = new Map<string, number>();
    for (const anexo of anexos) {
      totalAnexosPorCard.set(
        anexo.cardId,
        (totalAnexosPorCard.get(anexo.cardId) ?? 0) + 1,
      );
    }

    const comentariosPorCard = new Map<string, ComentarioResumo[]>();
    const totalComentariosPorCard = new Map<string, number>();
    if (comentariosCompletos) {
      const comentarios = await this.dataSource.manager.find(CardComentario, {
        where: { cardId: In(cardIds) },
        relations: { usuario: true },
        order: { createdAt: 'ASC' },
      });
      for (const comentario of comentarios) {
        const lista = comentariosPorCard.get(comentario.cardId) ?? [];
        lista.push({
          id: comentario.id,
          texto: comentario.texto,
          criadoEm: comentario.createdAt,
          atualizadoEm: comentario.updatedAt,
          usuario: { id: comentario.usuarioId, nome: comentario.usuario.nome },
        });
        comentariosPorCard.set(comentario.cardId, lista);
      }
      for (const [cardId, lista] of comentariosPorCard) {
        totalComentariosPorCard.set(cardId, lista.length);
      }
    } else {
      const comentarios = await this.dataSource.manager.find(CardComentario, {
        where: { cardId: In(cardIds) },
        select: { id: true, cardId: true },
      });
      for (const comentario of comentarios) {
        totalComentariosPorCard.set(
          comentario.cardId,
          (totalComentariosPorCard.get(comentario.cardId) ?? 0) + 1,
        );
      }
    }

    return cards.map((card) => {
      const conexoesDoProcesso = conexoesPorProcesso.get(card.processoId) ?? [];
      const filhos: FilhoConexaoInfo[] = conexoesDoProcesso.map((conexao) => {
        const cardFilhoId = card.filhos[conexao.posicao] ?? null;
        const cardFilho = cardFilhoId ? cardPorId.get(cardFilhoId) : undefined;
        return {
          posicao: conexao.posicao,
          conexaoId: conexao.id,
          processoDestinoId: conexao.processoDestinoId,
          ativo: conexao.ativo,
          cardFilhoId,
          cardFilhoTitulo: cardFilho?.titulo ?? null,
        };
      });

      let pai: PaiConexaoInfo | null = null;
      if (card.paiCardId && card.paiConexaoId) {
        const conexaoPai = conexaoPaiPorId.get(card.paiConexaoId);
        const cardPai = cardPorId.get(card.paiCardId);
        if (conexaoPai && cardPai) {
          pai = {
            cardId: card.paiCardId,
            cardTitulo: cardPai.titulo,
            conexaoId: card.paiConexaoId,
            processoId: conexaoPai.processoOrigemId,
            posicao: conexaoPai.posicao,
          };
        }
      }

      const base: CardComConexoes = {
        ...card,
        pai,
        filhos,
        comentarios: undefined,
        totalComentarios: totalComentariosPorCard.get(card.id) ?? 0,
        totalAnexos: totalAnexosPorCard.get(card.id) ?? 0,
      };

      if (comentariosCompletos) {
        base.comentarios = comentariosPorCard.get(card.id) ?? [];
      }

      return base;
    });
  }

  async criar(dto: CreateCardDto, usuarioId: string | null): Promise<Card> {
    const cardsCriados: Card[] = [];
    const cardsAtualizados = new Map<string, Card>();
    const card = await this.dataSource.transaction((manager) =>
      criarCardEmFase(
        manager,
        this.automacoesService,
        {
          processoId: dto.processoId,
          titulo: dto.titulo,
          campos: dto.campos,
        },
        { usuarioId, automatico: false },
        cardsCriados,
        0,
        cardsAtualizados,
      ),
    );
    this.notificarCardsCriados(cardsCriados);
    this.notificarCardsAtualizados(cardsAtualizados.values());
    return card;
  }

  async criarFilho(
    cardId: string,
    conexaoId: string,
    dto: CreateCardFilhoDto,
    usuarioId: string,
  ): Promise<Card> {
    const cardsCriados: Card[] = [];
    const cardsAtualizados = new Map<string, Card>();
    const filho = await this.dataSource.transaction(async (manager) => {
      const card = await manager.findOne(Card, { where: { id: cardId } });
      if (!card) {
        throw new NotFoundException('Card não encontrado');
      }

      const conexao = await manager.findOne(ProcessoConexao, {
        where: { id: conexaoId, processoOrigemId: card.processoId },
      });
      if (!conexao) {
        throw new NotFoundException('Conexão não encontrada neste processo');
      }
      if (!conexao.ativo) {
        throw new UnprocessableEntityException(
          'Conexão está inativa, não é possível criar novos filhos por ela',
        );
      }
      if (card.filhos[conexao.posicao]) {
        throw new ConflictException(
          'Já existe um card filho criado para esta conexão',
        );
      }

      const filho = await criarCardEmFase(
        manager,
        this.automacoesService,
        {
          processoId: conexao.processoDestinoId,
          titulo: dto.titulo
            ? interpolarTemplate(dto.titulo, card.campos)
            : card.titulo,
        },
        { usuarioId, automatico: false },
        cardsCriados,
        0,
        cardsAtualizados,
      );

      filho.paiCardId = card.id;
      filho.paiConexaoId = conexao.id;
      await manager.save(filho);

      const filhos = [...card.filhos];
      filhos[conexao.posicao] = filho.id;
      card.filhos = filhos;
      await manager.save(card);
      cardsAtualizados.set(card.id, card);

      return filho;
    });
    this.notificarCardsCriados(cardsCriados);
    this.notificarCardsAtualizados(cardsAtualizados.values());
    return filho;
  }

  async buscarPorId(cardId: string): Promise<CardComConexoes> {
    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: cardId },
      relations: { faseAtual: true },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    const [resultado] = await this.enriquecerComConexoes([card], {
      comentariosCompletos: true,
    });
    return resultado;
  }

  // Merge parcial em `card.campos` e disparo do gatilho CAMPO_ATUALIZADO para
  // cada chave enviada (independente do valor novo ser igual ao anterior —
  // o gatilho reage à chave ter sido enviada, não a uma mudança de fato).
  async atualizarCampos(
    cardId: string,
    dto: UpdateCardCamposDto,
    usuarioId: string,
  ): Promise<Card> {
    const cardsCriados: Card[] = [];
    const cardsAtualizados = new Map<string, Card>();
    const card = await this.dataSource.transaction(async (manager) => {
      const card = await manager.findOne(Card, { where: { id: cardId } });
      if (!card) {
        throw new NotFoundException('Card não encontrado');
      }

      const camposAntigos = card.campos;
      card.campos = { ...card.campos, ...dto.campos };
      await manager.save(card);
      cardsAtualizados.set(card.id, card);

      for (const chave of Object.keys(dto.campos)) {
        const valorAntigo = camposAntigos[chave];
        const valorNovo = card.campos[chave];
        if (JSON.stringify(valorAntigo) === JSON.stringify(valorNovo)) {
          continue;
        }
        await registrarEventoCard(manager, {
          cardId: card.id,
          tipo: CardEventoTipo.CAMPO_ATUALIZADO,
          ator: { usuarioId, automatico: false },
          dadosAntes: { [chave]: valorAntigo ?? null },
          dadosDepois: { [chave]: valorNovo },
        });
      }

      await this.automacoesService.executarGatilhoCampoAtualizado(
        manager,
        card,
        Object.keys(dto.campos),
        cardsCriados,
        0,
        cardsAtualizados,
      );

      return card;
    });
    this.notificarCardsCriados(cardsCriados);
    this.notificarCardsAtualizados(cardsAtualizados.values());
    return card;
  }

  async mover(
    cardId: string,
    dto: MoverCardDto,
    usuarioId: string,
  ): Promise<CardMovimentacao> {
    const cardsCriados: Card[] = [];
    const cardsAtualizados = new Map<string, Card>();
    const movimentacao = await this.dataSource.transaction(async (manager) => {
      const card = await manager.findOne(Card, { where: { id: cardId } });
      if (!card) {
        throw new NotFoundException('Card não encontrado');
      }

      return moverCardParaFase(
        manager,
        this.automacoesService,
        card,
        dto.faseDestinoId,
        { usuarioId, automatico: false },
        cardsCriados,
        0,
        cardsAtualizados,
      );
    });
    this.notificarCardsCriados(cardsCriados);
    this.notificarCardsAtualizados(cardsAtualizados.values());
    return movimentacao;
  }

  // Bloqueia exclusão se o card tiver filhos vinculados (evita referências
  // órfãs em `filhos`, já que esse vínculo não é uma FK de verdade). Se o
  // card excluído for filho de outro, limpa a posição correspondente no
  // `filhos` do pai. Movimentações e execuções de automação do card são
  // removidas em cascata pelo banco (onDelete: CASCADE nas entidades).
  async remover(cardId: string): Promise<void> {
    const { processoId, objectKeys } = await this.dataSource.transaction(
      async (manager) => {
        const card = await manager.findOne(Card, { where: { id: cardId } });
        if (!card) {
          throw new NotFoundException('Card não encontrado');
        }

        const temFilhos = card.filhos.some((filhoId) => filhoId !== null);
        if (temFilhos) {
          throw new ConflictException(
            'Card possui cards filhos vinculados; remova-os antes de excluir este card',
          );
        }

        if (card.paiCardId && card.paiConexaoId) {
          const conexaoPai = await manager.findOne(ProcessoConexao, {
            where: { id: card.paiConexaoId },
          });
          if (conexaoPai) {
            const pai = await manager.findOne(Card, {
              where: { id: card.paiCardId },
            });
            if (pai && pai.filhos[conexaoPai.posicao] === card.id) {
              const filhos = [...pai.filhos];
              filhos[conexaoPai.posicao] = null;
              pai.filhos = filhos;
              await manager.save(pai);
            }
          }
        }

        const anexos = await manager.find(CardAnexo, { where: { cardId } });

        await manager.delete(Card, cardId);
        return {
          processoId: card.processoId,
          objectKeys: anexos.map((anexo) => anexo.objectKey),
        };
      },
    );

    this.realtimeGateway.emitirCardRemovido(processoId, cardId);
    await Promise.allSettled(
      objectKeys.map((objectKey) => this.storageService.remover(objectKey)),
    );
  }
}
