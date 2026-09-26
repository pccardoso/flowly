import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Card } from './entities/card.entity';
import { CardResponsavel } from './entities/card-responsavel.entity';
import { CardEtiqueta } from './entities/card-etiqueta.entity';
import { Etiqueta } from '../etiquetas/entities/etiqueta.entity';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { User } from '../users/entities/user.entity';
import { montarPagina, PaginaResultado } from '../common/pagination';
import { CardComConexoes, CardsService } from './cards.service';
import { BuscarCardsDto, BuscarCardsPaginadoDto } from './dto/buscar-cards.dto';
import {
  avaliarFiltro,
  CampoFiltroDisponivel,
  FUSO_HORARIO_PADRAO,
  ItemParaFiltro,
  montarCatalogoFiltros,
  montarTextoBusca,
  tokensDaBusca,
  validarFiltro,
  validarFusoHorario,
} from './busca/card-filtro.util';

// Busca inteligente de cards (kanban e lista): busca livre + filtros por
// atributo combinados com E. Como os relatórios (RelatoriosService), filtra
// em memória sobre os cards do processo — o kanban já carrega todos eles de
// qualquer jeito. A lista paginada fatia o resultado já filtrado, então
// `meta.total` reflete o filtro. Só a página/lista final é enriquecida
// (pai/filhos, responsáveis, etiquetas, contagens).
@Injectable()
export class CardsBuscaService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cardsService: CardsService,
  ) {}

  private async buscarProcessoOuFalhar(processoId: string): Promise<Processo> {
    const processo = await this.dataSource.manager.findOne(Processo, {
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }
    return processo;
  }

  private buscarFases(processoId: string): Promise<Fase[]> {
    return this.dataSource.manager.find(Fase, {
      where: { processoId },
      order: { ordem: 'ASC' },
    });
  }

  // GET /cards/filtros-disponiveis — inclui as opções de etiqueta (todas do
  // processo) e de responsável (só quem é responsável de ao menos um card do
  // processo: opção sem nenhum card só devolveria lista vazia).
  async catalogo(processoId: string): Promise<CampoFiltroDisponivel[]> {
    const processo = await this.buscarProcessoOuFalhar(processoId);
    const fases = await this.buscarFases(processoId);
    const etiquetas = await this.dataSource.manager.find(Etiqueta, {
      where: { processoId },
      order: { nome: 'ASC' },
    });
    const usuarios = await this.dataSource.manager
      .createQueryBuilder(User, 'u')
      .select(['u.id', 'u.nome', 'u.email'])
      .innerJoin(CardResponsavel, 'cr', 'cr.usuarioId = u.id')
      .innerJoin(Card, 'c', 'c.id = cr.cardId')
      .where('c.processoId = :processoId', { processoId })
      .distinct(true)
      .orderBy('u.nome', 'ASC')
      .getMany();
    return montarCatalogoFiltros(processo, fases, etiquetas, usuarios);
  }

  // Cards do processo que passam na busca livre e em todos os filtros, na
  // mesma ordem das listagens normais (createdAt ASC).
  private async filtrarCards(dto: BuscarCardsDto): Promise<Card[]> {
    const fuso = dto.fusoHorario ?? FUSO_HORARIO_PADRAO;
    validarFusoHorario(fuso);

    const processo = await this.buscarProcessoOuFalhar(dto.processoId);
    const fases = await this.buscarFases(dto.processoId);
    const catalogoPorCampo = new Map(
      montarCatalogoFiltros(processo, fases).map((c) => [c.campo, c]),
    );

    const filtros = dto.filtros ?? [];
    for (const filtro of filtros) {
      validarFiltro(filtro, catalogoPorCampo.get(filtro.campo), fuso);
    }
    const tokens = tokensDaBusca(dto.busca);

    const cards = await this.dataSource.manager.find(Card, {
      where: { processoId: dto.processoId },
      relations: { faseAtual: true },
      order: { createdAt: 'ASC' },
    });
    if (filtros.length === 0 && tokens.length === 0) {
      return cards;
    }

    // Responsáveis/etiquetas só são carregados se algo os usa.
    const usaResponsaveis =
      tokens.length > 0 || filtros.some((f) => f.campo === 'responsaveis');
    const usaEtiquetas =
      tokens.length > 0 || filtros.some((f) => f.campo === 'etiquetas');

    const responsaveisPorCard = new Map<
      string,
      ItemParaFiltro['responsaveis']
    >();
    if (usaResponsaveis) {
      const linhas = await this.dataSource.manager
        .createQueryBuilder(CardResponsavel, 'cr')
        .innerJoinAndSelect('cr.usuario', 'u')
        .innerJoin('cr.card', 'c')
        .where('c.processoId = :processoId', { processoId: dto.processoId })
        .getMany();
      for (const l of linhas) {
        const lista = responsaveisPorCard.get(l.cardId) ?? [];
        lista.push({
          id: l.usuarioId,
          nome: l.usuario.nome,
          email: l.usuario.email,
        });
        responsaveisPorCard.set(l.cardId, lista);
      }
    }

    const etiquetasPorCard = new Map<string, ItemParaFiltro['etiquetas']>();
    if (usaEtiquetas) {
      const linhas = await this.dataSource.manager
        .createQueryBuilder(CardEtiqueta, 'ce')
        .innerJoinAndSelect('ce.etiqueta', 'e')
        .innerJoin('ce.card', 'c')
        .where('c.processoId = :processoId', { processoId: dto.processoId })
        .getMany();
      for (const l of linhas) {
        const lista = etiquetasPorCard.get(l.cardId) ?? [];
        lista.push({ id: l.etiquetaId, nome: l.etiqueta.nome });
        etiquetasPorCard.set(l.cardId, lista);
      }
    }

    const agora = new Date();
    return cards.filter((card) => {
      const item: ItemParaFiltro = {
        card,
        responsaveis: responsaveisPorCard.get(card.id) ?? [],
        etiquetas: etiquetasPorCard.get(card.id) ?? [],
      };
      if (tokens.length > 0) {
        const texto = montarTextoBusca(item);
        if (!tokens.every((t) => texto.includes(t))) {
          return false;
        }
      }
      return filtros.every((filtro) =>
        avaliarFiltro(
          item,
          catalogoPorCampo.get(filtro.campo)!,
          filtro,
          fuso,
          agora,
        ),
      );
    });
  }

  async buscar(dto: BuscarCardsDto): Promise<CardComConexoes[]> {
    const cards = await this.filtrarCards(dto);
    return this.cardsService.enriquecerParaListagem(cards);
  }

  async buscarPaginado(
    dto: BuscarCardsPaginadoDto,
  ): Promise<PaginaResultado<CardComConexoes>> {
    const cards = await this.filtrarCards(dto);
    const pagina = cards.slice(
      (dto.page - 1) * dto.perPage,
      dto.page * dto.perPage,
    );
    const data = await this.cardsService.enriquecerParaListagem(pagina);
    return montarPagina(data, cards.length, dto.page, dto.perPage);
  }
}
