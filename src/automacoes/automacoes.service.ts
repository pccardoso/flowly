import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { ProcessoConexao } from '../processos/entities/processo-conexao.entity';
import { Card } from '../cards/entities/card.entity';
import { criarCardEmFase, moverCardParaFase } from '../cards/card-creation.helper';
import { interpolarTemplate } from '../common/template.util';
import { Automacao } from './entities/automacao.entity';
import { AutomacaoAcao } from './entities/automacao-acao.entity';
import { AutomacaoExecucao } from './entities/automacao-execucao.entity';
import { CreateAutomacaoDto } from './dto/create-automacao.dto';
import { UpdateAutomacaoDto } from './dto/update-automacao.dto';
import { GatilhoTipo } from './enums/gatilho-tipo.enum';
import { AcaoTipo } from './enums/acao-tipo.enum';
import { StatusExecucao } from './enums/status-execucao.enum';

// Limite de automações encadeadas dentro da MESMA operação (ex.: automação A
// atualiza um campo que dispara a automação B, que move um card que dispara
// a automação C...). Sem isso, duas automações que se retro-alimentam
// (A atualiza campo X → dispara B → B atualiza campo X → dispara A de novo)
// travariam num loop infinito dentro da transação. Ao estourar, lança erro e
// desfaz a transação inteira — nenhuma automação da cadeia é aplicada.
const PROFUNDIDADE_MAXIMA_AUTOMACAO = 5;

@Injectable()
export class AutomacoesService {
  constructor(
    @InjectRepository(Automacao)
    private readonly automacaoRepository: Repository<Automacao>,
    @InjectRepository(AutomacaoAcao)
    private readonly automacaoAcaoRepository: Repository<AutomacaoAcao>,
    @InjectRepository(Processo)
    private readonly processoRepository: Repository<Processo>,
    @InjectRepository(Fase)
    private readonly faseRepository: Repository<Fase>,
    @InjectRepository(ProcessoConexao)
    private readonly processoConexaoRepository: Repository<ProcessoConexao>,
  ) {}

  async listarPorProcesso(processoId: string): Promise<Automacao[]> {
    const processo = await this.processoRepository.findOne({
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    return this.automacaoRepository.find({
      where: { processoId },
      relations: { acoes: true },
      order: { createdAt: 'ASC', acoes: { ordem: 'ASC' } },
    });
  }

  async criar(processoId: string, dto: CreateAutomacaoDto): Promise<Automacao> {
    const processo = await this.processoRepository.findOne({
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    await this.validarGatilho(processoId, dto.gatilhoTipo, dto.gatilhoConfig);
    await Promise.all(
      dto.acoes.map((acao) =>
        this.validarAcao(processoId, acao.tipo, acao.config),
      ),
    );

    const automacao = this.automacaoRepository.create({
      processoId,
      nome: dto.nome,
      ativo: dto.ativo ?? true,
      gatilhoTipo: dto.gatilhoTipo,
      gatilhoConfig: dto.gatilhoConfig,
      acoes: dto.acoes.map((acao) =>
        Object.assign(new AutomacaoAcao(), {
          tipo: acao.tipo,
          config: acao.config,
          ordem: acao.ordem,
        }),
      ),
    });

    return this.automacaoRepository.save(automacao);
  }

  // PATCH parcial: `nome`/`ativo` só sobrescrevem quando enviados.
  // `gatilhoTipo`/`gatilhoConfig` são revalidados juntos (mesclando com o
  // valor atual quando só um dos dois vier) porque o formato de
  // gatilhoConfig depende do tipo. `acoes`, quando enviado, substitui a
  // lista inteira — as ações antigas são apagadas e recriadas, já que
  // `cascade: true` no relacionamento não remove linhas órfãs sozinho.
  async atualizar(
    processoId: string,
    automacaoId: string,
    dto: UpdateAutomacaoDto,
  ): Promise<Automacao> {
    const automacao = await this.automacaoRepository.findOne({
      where: { id: automacaoId, processoId },
      relations: { acoes: true },
    });
    if (!automacao) {
      throw new NotFoundException('Automação não encontrada neste processo');
    }

    if (dto.nome !== undefined) {
      automacao.nome = dto.nome;
    }
    if (dto.ativo !== undefined) {
      automacao.ativo = dto.ativo;
    }

    if (dto.gatilhoTipo !== undefined || dto.gatilhoConfig !== undefined) {
      const gatilhoTipo = dto.gatilhoTipo ?? automacao.gatilhoTipo;
      const gatilhoConfig = dto.gatilhoConfig ?? automacao.gatilhoConfig;
      await this.validarGatilho(processoId, gatilhoTipo, gatilhoConfig);
      automacao.gatilhoTipo = gatilhoTipo;
      automacao.gatilhoConfig = gatilhoConfig;
    }

    if (dto.acoes !== undefined) {
      await Promise.all(
        dto.acoes.map((acao) =>
          this.validarAcao(processoId, acao.tipo, acao.config),
        ),
      );
      await this.automacaoAcaoRepository.delete({ automacaoId });
      automacao.acoes = dto.acoes.map((acao) =>
        Object.assign(new AutomacaoAcao(), {
          tipo: acao.tipo,
          config: acao.config,
          ordem: acao.ordem,
        }),
      );
    }

    return this.automacaoRepository.save(automacao);
  }

  async remover(processoId: string, automacaoId: string): Promise<void> {
    const automacao = await this.automacaoRepository.findOne({
      where: { id: automacaoId, processoId },
    });
    if (!automacao) {
      throw new NotFoundException('Automação não encontrada neste processo');
    }

    // Ações somem em cascata (onDelete: CASCADE em AutomacaoAcao). O
    // histórico em automacao_execucoes sobrevive com automacaoId = null
    // (onDelete: SET NULL), preservando a auditoria.
    await this.automacaoRepository.delete(automacaoId);
  }

  private async validarGatilho(
    processoId: string,
    tipo: GatilhoTipo,
    config: Record<string, unknown>,
  ): Promise<void> {
    switch (tipo) {
      case GatilhoTipo.CARD_ENTROU_NA_FASE: {
        const faseId = config?.faseId;
        if (typeof faseId !== 'string') {
          throw new UnprocessableEntityException(
            'gatilhoConfig.faseId é obrigatório para o gatilho CARD_ENTROU_NA_FASE',
          );
        }
        const fase = await this.faseRepository.findOne({
          where: { id: faseId, processoId },
        });
        if (!fase) {
          throw new NotFoundException(
            'Fase informada em gatilhoConfig.faseId não encontrada neste processo',
          );
        }
        return;
      }
      case GatilhoTipo.CAMPO_ATUALIZADO: {
        if (typeof config?.campo !== 'string' || !config.campo.trim()) {
          throw new UnprocessableEntityException(
            'gatilhoConfig.campo é obrigatório (string) para o gatilho CAMPO_ATUALIZADO',
          );
        }
        return;
      }
      default:
        throw new UnprocessableEntityException(
          `Tipo de gatilho não suportado: ${tipo}`,
        );
    }
  }

  private async validarAcao(
    processoId: string,
    tipo: AcaoTipo,
    config: Record<string, unknown>,
  ): Promise<void> {
    switch (tipo) {
      case AcaoTipo.ATUALIZAR_CAMPO: {
        if (typeof config?.campo !== 'string' || !config.campo.trim()) {
          throw new UnprocessableEntityException(
            'config.campo é obrigatório (string) para a ação ATUALIZAR_CAMPO',
          );
        }
        if (!('valor' in config)) {
          throw new UnprocessableEntityException(
            'config.valor é obrigatório para a ação ATUALIZAR_CAMPO',
          );
        }
        return;
      }
      case AcaoTipo.ATUALIZAR_TITULO: {
        if (typeof config?.titulo !== 'string' || !config.titulo.trim()) {
          throw new UnprocessableEntityException(
            'config.titulo é obrigatório (string) para a ação ATUALIZAR_TITULO',
          );
        }
        return;
      }
      case AcaoTipo.CRIAR_CARD_FILHO: {
        if (typeof config?.conexaoId !== 'string' || !config.conexaoId.trim()) {
          throw new UnprocessableEntityException(
            'config.conexaoId é obrigatório (string) para a ação CRIAR_CARD_FILHO',
          );
        }
        if ('titulo' in config && typeof config.titulo !== 'string') {
          throw new UnprocessableEntityException(
            'config.titulo deve ser uma string quando informado',
          );
        }
        const conexao = await this.processoConexaoRepository.findOne({
          where: { id: config.conexaoId, processoOrigemId: processoId },
        });
        if (!conexao) {
          throw new NotFoundException(
            'Conexão informada em config.conexaoId não encontrada neste processo',
          );
        }
        return;
      }
      case AcaoTipo.MOVER_CARD_PAI: {
        // A fase de destino é de um processo que só se sabe em tempo de
        // execução (o processo de origem de quem quer que tenha criado este
        // card como filho) — não dá pra validar existência aqui.
        if (
          typeof config?.faseDestinoId !== 'string' ||
          !config.faseDestinoId.trim()
        ) {
          throw new UnprocessableEntityException(
            'config.faseDestinoId é obrigatório (string) para a ação MOVER_CARD_PAI',
          );
        }
        return;
      }
      case AcaoTipo.MOVER_CARD_FILHO: {
        if (typeof config?.conexaoId !== 'string' || !config.conexaoId.trim()) {
          throw new UnprocessableEntityException(
            'config.conexaoId é obrigatório (string) para a ação MOVER_CARD_FILHO',
          );
        }
        if (
          typeof config?.faseDestinoId !== 'string' ||
          !config.faseDestinoId.trim()
        ) {
          throw new UnprocessableEntityException(
            'config.faseDestinoId é obrigatório (string) para a ação MOVER_CARD_FILHO',
          );
        }
        const conexaoFilho = await this.processoConexaoRepository.findOne({
          where: { id: config.conexaoId, processoOrigemId: processoId },
        });
        if (!conexaoFilho) {
          throw new NotFoundException(
            'Conexão informada em config.conexaoId não encontrada neste processo',
          );
        }
        return;
      }
      case AcaoTipo.MOVER_CARD_ATUAL: {
        // Diferente de MOVER_CARD_PAI (o pai pode ser de outro processo, só
        // se sabe em tempo de execução), o próprio card sempre pertence ao
        // mesmo processo da automação — dá pra validar a fase já na criação.
        if (
          typeof config?.faseDestinoId !== 'string' ||
          !config.faseDestinoId.trim()
        ) {
          throw new UnprocessableEntityException(
            'config.faseDestinoId é obrigatório (string) para a ação MOVER_CARD_ATUAL',
          );
        }
        const faseDestino = await this.faseRepository.findOne({
          where: { id: config.faseDestinoId, processoId },
        });
        if (!faseDestino) {
          throw new NotFoundException(
            'Fase informada em config.faseDestinoId não encontrada neste processo',
          );
        }
        return;
      }
      default:
        throw new UnprocessableEntityException(
          `Tipo de ação não suportado: ${tipo}`,
        );
    }
  }

  // Chamado por CardsService dentro da MESMA transação da operação que
  // disparou o evento (criação do card ou movimentação). Se qualquer ação
  // falhar, o erro sobe e derruba a transação inteira: a operação que
  // disparou o gatilho só é confirmada se as automações também forem.
  async executarGatilhoCardEntrouNaFase(
    manager: EntityManager,
    card: Card,
    faseId: string,
    cardsCriados?: Card[],
    profundidade = 0,
    cardsAtualizados?: Map<string, Card>,
  ): Promise<void> {
    this.verificarProfundidade(profundidade);

    const automacoes = await manager.find(Automacao, {
      where: {
        processoId: card.processoId,
        ativo: true,
        gatilhoTipo: GatilhoTipo.CARD_ENTROU_NA_FASE,
      },
      relations: { acoes: true },
      order: { acoes: { ordem: 'ASC' } },
    });

    const disparadas = automacoes.filter(
      (automacao) =>
        (automacao.gatilhoConfig as { faseId?: string })?.faseId === faseId,
    );

    await this.executarAutomacoesDisparadas(
      manager,
      disparadas,
      card,
      cardsCriados,
      profundidade,
      cardsAtualizados,
    );
  }

  // Disparado quando `card.campos` é alterado — tanto por uma edição manual
  // (CardsService.atualizarCampos) quanto pela própria ação ATUALIZAR_CAMPO
  // de outra automação (ver `executarAcao`), permitindo encadear automações
  // sobre o mesmo card ou sobre outro (ex.: MOVER_CARD_PAI/FILHO).
  async executarGatilhoCampoAtualizado(
    manager: EntityManager,
    card: Card,
    camposAlterados: string[],
    cardsCriados?: Card[],
    profundidade = 0,
    cardsAtualizados?: Map<string, Card>,
  ): Promise<void> {
    if (camposAlterados.length === 0) {
      return;
    }
    this.verificarProfundidade(profundidade);

    const automacoes = await manager.find(Automacao, {
      where: {
        processoId: card.processoId,
        ativo: true,
        gatilhoTipo: GatilhoTipo.CAMPO_ATUALIZADO,
      },
      relations: { acoes: true },
      order: { acoes: { ordem: 'ASC' } },
    });

    const camposAlteradosSet = new Set(camposAlterados);
    const disparadas = automacoes.filter((automacao) =>
      camposAlteradosSet.has(
        (automacao.gatilhoConfig as { campo?: string })?.campo ?? '',
      ),
    );

    await this.executarAutomacoesDisparadas(
      manager,
      disparadas,
      card,
      cardsCriados,
      profundidade,
      cardsAtualizados,
    );
  }

  private verificarProfundidade(profundidade: number): void {
    if (profundidade >= PROFUNDIDADE_MAXIMA_AUTOMACAO) {
      throw new UnprocessableEntityException(
        'Limite de encadeamento de automações excedido (possível loop entre automações)',
      );
    }
  }

  // Roda as ações de cada automação disparada e grava o log de execução
  // (sucesso ou erro) em `automacao_execucoes`. Compartilhado pelos dois
  // gatilhos hoje existentes (CARD_ENTROU_NA_FASE e CAMPO_ATUALIZADO).
  private async executarAutomacoesDisparadas(
    manager: EntityManager,
    automacoes: Automacao[],
    card: Card,
    cardsCriados: Card[] | undefined,
    profundidade: number,
    cardsAtualizados: Map<string, Card> | undefined,
  ): Promise<void> {
    for (const automacao of automacoes) {
      try {
        for (const acao of automacao.acoes) {
          await this.executarAcao(
            manager,
            card,
            acao,
            cardsCriados,
            profundidade,
            cardsAtualizados,
          );
        }
        await manager.save(
          manager.create(AutomacaoExecucao, {
            automacaoId: automacao.id,
            cardId: card.id,
            gatilhoTipo: automacao.gatilhoTipo,
            status: StatusExecucao.SUCESSO,
            detalhe: null,
          }),
        );
      } catch (error) {
        await manager.save(
          manager.create(AutomacaoExecucao, {
            automacaoId: automacao.id,
            cardId: card.id,
            gatilhoTipo: automacao.gatilhoTipo,
            status: StatusExecucao.ERRO,
            detalhe: { mensagem: (error as Error).message },
          }),
        );
        throw error;
      }
    }
  }

  private async executarAcao(
    manager: EntityManager,
    card: Card,
    acao: AutomacaoAcao,
    cardsCriados: Card[] | undefined,
    profundidade: number,
    cardsAtualizados: Map<string, Card> | undefined,
  ): Promise<void> {
    switch (acao.tipo) {
      case AcaoTipo.ATUALIZAR_CAMPO: {
        const { campo, valor } = acao.config as {
          campo: string;
          valor: unknown;
        };
        const valorResolvido =
          typeof valor === 'string'
            ? interpolarTemplate(valor, card.campos)
            : valor;
        card.campos = { ...card.campos, [campo]: valorResolvido };
        await manager.save(card);
        cardsAtualizados?.set(card.id, card);
        await this.executarGatilhoCampoAtualizado(
          manager,
          card,
          [campo],
          cardsCriados,
          profundidade + 1,
          cardsAtualizados,
        );
        return;
      }
      case AcaoTipo.ATUALIZAR_TITULO: {
        const { titulo } = acao.config as { titulo: string };
        card.titulo = interpolarTemplate(titulo, card.campos);
        await manager.save(card);
        cardsAtualizados?.set(card.id, card);
        return;
      }
      case AcaoTipo.CRIAR_CARD_FILHO: {
        const { conexaoId, titulo } = acao.config as {
          conexaoId: string;
          titulo?: string;
        };
        const conexao = await manager.findOne(ProcessoConexao, {
          where: { id: conexaoId, processoOrigemId: card.processoId },
        });
        // Conexão pode ter sido desativada depois que a automação foi
        // criada, ou o slot já pode estar ocupado se o card reentrou nesta
        // fase (ex.: voltou e avançou de novo). Em ambos os casos a ação é
        // ignorada silenciosamente — idempotente, sem derrubar a automação.
        if (!conexao || !conexao.ativo || card.filhos[conexao.posicao]) {
          return;
        }

        const filho = await criarCardEmFase(
          manager,
          this,
          {
            processoId: conexao.processoDestinoId,
            titulo: titulo
              ? interpolarTemplate(titulo, card.campos)
              : card.titulo,
          },
          cardsCriados,
          profundidade + 1,
          cardsAtualizados,
        );
        filho.paiCardId = card.id;
        filho.paiConexaoId = conexao.id;
        await manager.save(filho);

        const filhos = [...card.filhos];
        filhos[conexao.posicao] = filho.id;
        card.filhos = filhos;
        await manager.save(card);
        cardsAtualizados?.set(card.id, card);
        return;
      }
      case AcaoTipo.MOVER_CARD_PAI: {
        const { faseDestinoId } = acao.config as { faseDestinoId: string };
        if (!card.paiCardId) {
          // Card não tem pai — nada a mover, não é erro de configuração.
          return;
        }
        const cardPai = await manager.findOne(Card, {
          where: { id: card.paiCardId },
        });
        if (!cardPai) {
          return;
        }
        // Lança se a transição não estiver configurada no grafo de fases do
        // processo do pai — igual à movimentação manual (CardsService.mover).
        await moverCardParaFase(
          manager,
          this,
          cardPai,
          faseDestinoId,
          cardsCriados,
          profundidade + 1,
          cardsAtualizados,
        );
        return;
      }
      case AcaoTipo.MOVER_CARD_FILHO: {
        const { conexaoId, faseDestinoId } = acao.config as {
          conexaoId: string;
          faseDestinoId: string;
        };
        const conexaoFilho = await manager.findOne(ProcessoConexao, {
          where: { id: conexaoId, processoOrigemId: card.processoId },
        });
        const filhoId = conexaoFilho ? card.filhos[conexaoFilho.posicao] : null;
        if (!filhoId) {
          // Ainda não existe card filho criado nessa conexão — nada a mover.
          return;
        }
        const cardFilho = await manager.findOne(Card, {
          where: { id: filhoId },
        });
        if (!cardFilho) {
          return;
        }
        await moverCardParaFase(
          manager,
          this,
          cardFilho,
          faseDestinoId,
          cardsCriados,
          profundidade + 1,
          cardsAtualizados,
        );
        return;
      }
      case AcaoTipo.MOVER_CARD_ATUAL: {
        const { faseDestinoId } = acao.config as { faseDestinoId: string };
        await moverCardParaFase(
          manager,
          this,
          card,
          faseDestinoId,
          cardsCriados,
          profundidade + 1,
          cardsAtualizados,
        );
        return;
      }
      default:
        throw new Error(`Tipo de ação não suportado: ${acao.tipo}`);
    }
  }
}
