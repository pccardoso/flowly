import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Processo } from './entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { FaseTransicao } from '../fases/entities/fase-transicao.entity';
import { ProcessoConexao } from './entities/processo-conexao.entity';
import { Card } from '../cards/entities/card.entity';
import { CardAnexo } from '../cards/entities/card-anexo.entity';
import { CreateProcessoDto } from './dto/create-processo.dto';
import { UpdateProcessoDto } from './dto/update-processo.dto';
import { CreateFaseDto } from './dto/create-fase.dto';
import { UpdateFaseDto } from './dto/update-fase.dto';
import { CreateFaseTransicaoDto } from './dto/create-fase-transicao.dto';
import { UpdateFaseTransicaoDto } from './dto/update-fase-transicao.dto';
import { CreateProcessoConexaoDto } from './dto/create-processo-conexao.dto';
import { DefinirFormularioEntradaDto } from './dto/definir-formulario-entrada.dto';
import { CampoFormulario } from './formulario/campo-formulario.interface';
import { StorageService } from '../storage/storage.service';

const UNIQUE_VIOLATION = '23505';

export interface ImagemParaUpload {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

export interface ImagemDownload {
  mimeType: string;
  stream: Readable;
}

export interface ProcessoResposta {
  id: string;
  nome: string;
  cor: string | null;
  descricao: string | null;
  imagemUrl: string | null;
  camposExibidosNoCard: string[];
  tituloCampoId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ProcessoComContagem = ProcessoResposta & { totalCards: number };

@Injectable()
export class ProcessosService {
  constructor(
    @InjectRepository(Processo)
    private readonly processoRepository: Repository<Processo>,
    @InjectRepository(Fase)
    private readonly faseRepository: Repository<Fase>,
    @InjectRepository(FaseTransicao)
    private readonly faseTransicaoRepository: Repository<FaseTransicao>,
    @InjectRepository(ProcessoConexao)
    private readonly processoConexaoRepository: Repository<ProcessoConexao>,
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
    private readonly storageService: StorageService,
    private readonly dataSource: DataSource,
  ) {}

  // Nunca expõe imagemObjectKey/imagemMimeType crus — o front só recebe uma
  // URL relativa que passa pela nossa própria rota de download.
  private paraResposta(processo: Processo): ProcessoResposta {
    return {
      id: processo.id,
      nome: processo.nome,
      cor: processo.cor,
      descricao: processo.descricao,
      imagemUrl: processo.imagemObjectKey
        ? `/processos/${processo.id}/imagem`
        : null,
      camposExibidosNoCard: processo.camposExibidosNoCard,
      tituloCampoId: processo.tituloCampoId,
      createdAt: processo.createdAt,
      updatedAt: processo.updatedAt,
    };
  }

  // ids referenciados (camposExibidosNoCard, tituloCampoId) precisam
  // existir no formularioEntrada — evita configuração apontando pra um
  // campo que não existe (ou que já foi removido do formulário).
  private validarIdsDoFormulario(processo: Processo, ids: string[]): void {
    const idsValidos = new Set(
      processo.formularioEntrada.map((campo) => campo.id),
    );
    const invalidos = ids.filter((id) => !idsValidos.has(id));
    if (invalidos.length > 0) {
      throw new UnprocessableEntityException(
        `Campo(s) não existem no formulário de entrada deste processo: ${invalidos.join(', ')}`,
      );
    }
  }

  async listar(): Promise<ProcessoComContagem[]> {
    const processos = await this.processoRepository.find({
      order: { nome: 'ASC' },
    });
    if (processos.length === 0) {
      return [];
    }

    const processoIds = processos.map((processo) => processo.id);
    const contagens = await this.cardRepository
      .createQueryBuilder('card')
      .select('card.processoId', 'processoId')
      .addSelect('COUNT(*)', 'total')
      .where('card.processoId IN (:...processoIds)', { processoIds })
      .groupBy('card.processoId')
      .getRawMany<{ processoId: string; total: string }>();
    const totalPorProcesso = new Map(
      contagens.map((c) => [c.processoId, Number(c.total)]),
    );

    return processos.map((processo) => ({
      ...this.paraResposta(processo),
      totalCards: totalPorProcesso.get(processo.id) ?? 0,
    }));
  }

  async criar(dto: CreateProcessoDto): Promise<ProcessoResposta> {
    const processo = await this.processoRepository.save(
      this.processoRepository.create(dto),
    );
    return this.paraResposta(processo);
  }

  async atualizar(id: string, dto: UpdateProcessoDto): Promise<ProcessoResposta> {
    const processo = await this.processoRepository.findOne({
      where: { id },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    // Assign campo a campo (em vez de Object.assign) porque o DTO chega do
    // class-transformer com todas as chaves declaradas presentes mesmo
    // quando não enviadas no request (valor `undefined`, mas a chave existe)
    // — um Object.assign apagaria campos não enviados no PATCH parcial.
    if (dto.nome !== undefined) {
      processo.nome = dto.nome;
    }
    if (dto.cor !== undefined) {
      processo.cor = dto.cor;
    }
    if (dto.descricao !== undefined) {
      processo.descricao = dto.descricao;
    }
    if (dto.camposExibidosNoCard !== undefined) {
      this.validarIdsDoFormulario(processo, dto.camposExibidosNoCard);
      processo.camposExibidosNoCard = dto.camposExibidosNoCard;
    }
    if (dto.tituloCampoId !== undefined) {
      this.validarIdsDoFormulario(processo, [dto.tituloCampoId]);
      processo.tituloCampoId = dto.tituloCampoId;
    }

    const salvo = await this.processoRepository.save(processo);
    return this.paraResposta(salvo);
  }

  // Substitui o formulário de entrada inteiro (o front edita a lista
  // completa numa tela só e salva de uma vez, igual PUT). Só a definição por
  // enquanto — a criação de card ainda não valida `campos` contra isso.
  async definirFormularioEntrada(
    id: string,
    dto: DefinirFormularioEntradaDto,
  ): Promise<CampoFormulario[]> {
    const processo = await this.processoRepository.findOne({
      where: { id },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    const ids = dto.campos.map((campo) => campo.id);
    if (new Set(ids).size !== ids.length) {
      throw new UnprocessableEntityException(
        'Campos do formulário não podem repetir o mesmo id',
      );
    }

    processo.formularioEntrada = dto.campos;
    await this.processoRepository.save(processo);
    return processo.formularioEntrada;
  }

  async enviarImagem(
    processoId: string,
    arquivo: ImagemParaUpload,
  ): Promise<ProcessoResposta> {
    const processo = await this.processoRepository.findOne({
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    const objectKeyAnterior = processo.imagemObjectKey;
    const objectKey = `processos/${processoId}/${randomUUID()}-${arquivo.originalname}`;
    await this.storageService.salvar(
      objectKey,
      arquivo.buffer,
      arquivo.mimetype,
    );

    processo.imagemObjectKey = objectKey;
    processo.imagemMimeType = arquivo.mimetype;

    try {
      const salvo = await this.processoRepository.save(processo);
      // Só apaga a imagem antiga depois que a nova já está persistida.
      if (objectKeyAnterior) {
        await this.storageService
          .remover(objectKeyAnterior)
          .catch(() => undefined);
      }
      return this.paraResposta(salvo);
    } catch (erro) {
      await this.storageService.remover(objectKey).catch(() => undefined);
      throw erro;
    }
  }

  async obterImagem(processoId: string): Promise<ImagemDownload> {
    const processo = await this.processoRepository.findOne({
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }
    if (!processo.imagemObjectKey) {
      throw new NotFoundException('Processo não possui imagem');
    }

    const stream = await this.storageService.obterStream(
      processo.imagemObjectKey,
    );
    return {
      mimeType: processo.imagemMimeType ?? 'application/octet-stream',
      stream,
    };
  }

  // Apaga o processo e tudo vinculado a ele (fases, transições, conexões,
  // cards, comentários, anexos, automações). A única exceção: cards deste
  // processo que são PAI de um card criado em OUTRO processo (via
  // ProcessoConexao) — o filho nunca é apagado, só perde a referência ao pai.
  async remover(processoId: string): Promise<void> {
    const { imagemObjectKey, anexoObjectKeys } =
      await this.dataSource.transaction(async (manager) => {
        const processo = await manager.findOne(Processo, {
          where: { id: processoId },
        });
        if (!processo) {
          throw new NotFoundException('Processo não encontrado');
        }

        const cards = await manager.find(Card, {
          where: { processoId },
          select: { id: true, paiCardId: true, paiConexaoId: true },
        });
        const cardIds = cards.map((card) => card.id);

        if (cardIds.length > 0) {
          // Filhos criados em OUTROS processos a partir de cards deste
          // processo: o pai vai sumir, mas o filho continua existindo — só
          // perde a referência ao pai (requisito explícito: isso não pode
          // apagar o filho).
          await manager.update(
            Card,
            { paiCardId: In(cardIds) },
            { paiCardId: null, paiConexaoId: null },
          );

          // Cards deste processo que são filho de um card em OUTRO
          // processo: o pai sobrevive, então precisa limpar a posição
          // correspondente no `filhos` dele antes do filho sumir (mesma
          // lógica do CardsService.remover, só que em lote).
          const filhosComPaiExterno = cards.filter(
            (card) => card.paiCardId && card.paiConexaoId,
          );
          if (filhosComPaiExterno.length > 0) {
            const paiIds = Array.from(
              new Set(filhosComPaiExterno.map((c) => c.paiCardId as string)),
            );
            const conexaoIds = Array.from(
              new Set(
                filhosComPaiExterno.map((c) => c.paiConexaoId as string),
              ),
            );

            const pais = await manager.find(Card, {
              where: { id: In(paiIds) },
            });
            const paiPorId = new Map(pais.map((pai) => [pai.id, pai]));

            const conexoes = await manager.find(ProcessoConexao, {
              where: { id: In(conexaoIds) },
            });
            const posicaoPorConexao = new Map(
              conexoes.map((conexao) => [conexao.id, conexao.posicao]),
            );

            for (const filho of filhosComPaiExterno) {
              const pai = paiPorId.get(filho.paiCardId as string);
              const posicao = posicaoPorConexao.get(
                filho.paiConexaoId as string,
              );
              if (pai && posicao !== undefined && pai.filhos[posicao] === filho.id) {
                const filhosArray = [...pai.filhos];
                filhosArray[posicao] = null;
                pai.filhos = filhosArray;
              }
            }

            if (paiPorId.size > 0) {
              await manager.save([...paiPorId.values()]);
            }
          }
        }

        // Conexões onde este processo é o DESTINO usam onDelete: RESTRICT
        // de propósito (protege contra apagar sem querer um processo usado
        // como destino de outro fluxo) — como aqui a exclusão é explícita e
        // "apaga tudo vinculado", removemos essas arestas manualmente antes
        // de excluir o processo.
        await manager.delete(ProcessoConexao, {
          processoDestinoId: processoId,
        });

        const anexos = cardIds.length
          ? await manager.find(CardAnexo, { where: { cardId: In(cardIds) } })
          : [];

        // Fases, transições, conexões de saída, cards (com seus
        // anexos/comentários/movimentações) e automações deste processo são
        // removidos em cascata pelo banco (onDelete: CASCADE nas entidades).
        await manager.delete(Processo, processoId);

        return {
          imagemObjectKey: processo.imagemObjectKey,
          anexoObjectKeys: anexos.map((anexo) => anexo.objectKey),
        };
      });

    const objectKeys = imagemObjectKey
      ? [...anexoObjectKeys, imagemObjectKey]
      : anexoObjectKeys;
    await Promise.allSettled(
      objectKeys.map((objectKey) => this.storageService.remover(objectKey)),
    );
  }

  async criarFase(processoId: string, dto: CreateFaseDto): Promise<Fase> {
    const processo = await this.processoRepository.findOne({
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    return this.faseRepository.save(
      this.faseRepository.create({ ...dto, processoId }),
    );
  }

  async atualizarFase(
    processoId: string,
    faseId: string,
    dto: UpdateFaseDto,
  ): Promise<Fase> {
    const fase = await this.faseRepository.findOne({
      where: { id: faseId, processoId },
    });
    if (!fase) {
      throw new NotFoundException('Fase não encontrada neste processo');
    }

    if (dto.nome !== undefined) {
      fase.nome = dto.nome;
    }
    if (dto.ordem !== undefined) {
      fase.ordem = dto.ordem;
    }
    if (dto.cor !== undefined) {
      fase.cor = dto.cor;
    }

    return this.faseRepository.save(fase);
  }

  // Apaga a fase e todos os cards nela (com seus anexos/comentários/
  // movimentações, via CASCADE no banco). Cards filhos (criados em OUTROS
  // processos via ProcessoConexao) a partir de um card apagado aqui NÃO são
  // removidos — só perdem a referência ao pai e ficam órfãos, mesmo
  // comportamento de ProcessosService.remover. Transições ligadas a esta
  // fase (entrada ou saída) somem em cascata (onDelete: CASCADE).
  async removerFase(processoId: string, faseId: string): Promise<void> {
    const { anexoObjectKeys } = await this.dataSource.transaction(
      async (manager) => {
        const fase = await manager.findOne(Fase, {
          where: { id: faseId, processoId },
        });
        if (!fase) {
          throw new NotFoundException('Fase não encontrada neste processo');
        }

        const cards = await manager.find(Card, {
          where: { faseAtualId: faseId },
          select: { id: true, paiCardId: true, paiConexaoId: true },
        });
        const cardIds = cards.map((card) => card.id);

        if (cardIds.length > 0) {
          await manager.update(
            Card,
            { paiCardId: In(cardIds) },
            { paiCardId: null, paiConexaoId: null },
          );

          const filhosComPaiExterno = cards.filter(
            (card) => card.paiCardId && card.paiConexaoId,
          );
          if (filhosComPaiExterno.length > 0) {
            const paiIds = Array.from(
              new Set(filhosComPaiExterno.map((c) => c.paiCardId as string)),
            );
            const conexaoIds = Array.from(
              new Set(
                filhosComPaiExterno.map((c) => c.paiConexaoId as string),
              ),
            );

            const pais = await manager.find(Card, {
              where: { id: In(paiIds) },
            });
            const paiPorId = new Map(pais.map((pai) => [pai.id, pai]));

            const conexoes = await manager.find(ProcessoConexao, {
              where: { id: In(conexaoIds) },
            });
            const posicaoPorConexao = new Map(
              conexoes.map((conexao) => [conexao.id, conexao.posicao]),
            );

            for (const filho of filhosComPaiExterno) {
              const pai = paiPorId.get(filho.paiCardId as string);
              const posicao = posicaoPorConexao.get(
                filho.paiConexaoId as string,
              );
              if (pai && posicao !== undefined && pai.filhos[posicao] === filho.id) {
                const filhosArray = [...pai.filhos];
                filhosArray[posicao] = null;
                pai.filhos = filhosArray;
              }
            }

            if (paiPorId.size > 0) {
              await manager.save([...paiPorId.values()]);
            }
          }
        }

        const anexos = cardIds.length
          ? await manager.find(CardAnexo, { where: { cardId: In(cardIds) } })
          : [];

        // Cards precisam sumir antes da fase por causa do onDelete: RESTRICT
        // em Card.faseAtual.
        if (cardIds.length > 0) {
          await manager.delete(Card, cardIds);
        }
        await manager.delete(Fase, faseId);

        return { anexoObjectKeys: anexos.map((anexo) => anexo.objectKey) };
      },
    );

    await Promise.allSettled(
      anexoObjectKeys.map((objectKey) => this.storageService.remover(objectKey)),
    );
  }

  async criarTransicao(
    processoId: string,
    dto: CreateFaseTransicaoDto,
  ): Promise<FaseTransicao> {
    if (dto.faseOrigemId === dto.faseDestinoId) {
      throw new UnprocessableEntityException(
        'Fase de origem e destino não podem ser iguais',
      );
    }

    const [faseOrigem, faseDestino] = await Promise.all([
      this.faseRepository.findOne({
        where: { id: dto.faseOrigemId, processoId },
      }),
      this.faseRepository.findOne({
        where: { id: dto.faseDestinoId, processoId },
      }),
    ]);
    if (!faseOrigem || !faseDestino) {
      throw new NotFoundException(
        'Fase de origem ou destino não encontrada neste processo',
      );
    }

    try {
      return await this.faseTransicaoRepository.save(
        this.faseTransicaoRepository.create({
          faseOrigemId: dto.faseOrigemId,
          faseDestinoId: dto.faseDestinoId,
        }),
      );
    } catch (error) {
      const driverCode = (error as { driverError?: { code?: string } })
        .driverError?.code;
      if (error instanceof QueryFailedError && driverCode === UNIQUE_VIOLATION) {
        throw new ConflictException('Essa transição já está cadastrada');
      }
      throw error;
    }
  }

  async atualizarTransicao(
    processoId: string,
    transicaoId: string,
    dto: UpdateFaseTransicaoDto,
  ): Promise<FaseTransicao> {
    const transicao = await this.faseTransicaoRepository.findOne({
      where: { id: transicaoId },
    });
    if (!transicao) {
      throw new NotFoundException('Transição não encontrada');
    }

    const pertenceAoProcesso = await this.faseRepository.findOne({
      where: { id: transicao.faseOrigemId, processoId },
    });
    if (!pertenceAoProcesso) {
      throw new NotFoundException('Transição não encontrada neste processo');
    }

    const faseOrigemId = dto.faseOrigemId ?? transicao.faseOrigemId;
    const faseDestinoId = dto.faseDestinoId ?? transicao.faseDestinoId;

    if (faseOrigemId === faseDestinoId) {
      throw new UnprocessableEntityException(
        'Fase de origem e destino não podem ser iguais',
      );
    }

    const [faseOrigem, faseDestino] = await Promise.all([
      this.faseRepository.findOne({ where: { id: faseOrigemId, processoId } }),
      this.faseRepository.findOne({ where: { id: faseDestinoId, processoId } }),
    ]);
    if (!faseOrigem || !faseDestino) {
      throw new NotFoundException(
        'Fase de origem ou destino não encontrada neste processo',
      );
    }

    transicao.faseOrigemId = faseOrigemId;
    transicao.faseDestinoId = faseDestinoId;

    try {
      return await this.faseTransicaoRepository.save(transicao);
    } catch (error) {
      const driverCode = (error as { driverError?: { code?: string } })
        .driverError?.code;
      if (error instanceof QueryFailedError && driverCode === UNIQUE_VIOLATION) {
        throw new ConflictException('Essa transição já está cadastrada');
      }
      throw error;
    }
  }

  async removerTransicao(
    processoId: string,
    transicaoId: string,
  ): Promise<void> {
    const transicao = await this.faseTransicaoRepository.findOne({
      where: { id: transicaoId },
    });
    if (!transicao) {
      throw new NotFoundException('Transição não encontrada');
    }

    const pertenceAoProcesso = await this.faseRepository.findOne({
      where: { id: transicao.faseOrigemId, processoId },
    });
    if (!pertenceAoProcesso) {
      throw new NotFoundException('Transição não encontrada neste processo');
    }

    await this.faseTransicaoRepository.delete(transicaoId);
  }

  async criarConexao(
    processoOrigemId: string,
    dto: CreateProcessoConexaoDto,
  ): Promise<ProcessoConexao> {
    if (processoOrigemId === dto.processoDestinoId) {
      throw new UnprocessableEntityException(
        'Processo de origem e destino não podem ser iguais',
      );
    }

    const [processoOrigem, processoDestino] = await Promise.all([
      this.processoRepository.findOne({ where: { id: processoOrigemId } }),
      this.processoRepository.findOne({
        where: { id: dto.processoDestinoId },
      }),
    ]);
    if (!processoOrigem || !processoDestino) {
      throw new NotFoundException(
        'Processo de origem ou destino não encontrado',
      );
    }

    const conexaoAtivaExistente = await this.processoConexaoRepository.findOne(
      {
        where: {
          processoOrigemId,
          processoDestinoId: dto.processoDestinoId,
          ativo: true,
        },
      },
    );
    if (conexaoAtivaExistente) {
      throw new ConflictException(
        'Já existe uma conexão ativa para este processo de destino',
      );
    }

    // posicao nunca é reaproveitada: soma 1 à última já usada por este
    // processoOrigemId, incluindo conexões desativadas.
    const ultimaConexao = await this.processoConexaoRepository.findOne({
      where: { processoOrigemId },
      order: { posicao: 'DESC' },
    });
    const posicao = ultimaConexao ? ultimaConexao.posicao + 1 : 0;

    return this.processoConexaoRepository.save(
      this.processoConexaoRepository.create({
        processoOrigemId,
        processoDestinoId: dto.processoDestinoId,
        posicao,
        ativo: true,
      }),
    );
  }

  async listarConexoes(processoOrigemId: string): Promise<ProcessoConexao[]> {
    const processo = await this.processoRepository.findOne({
      where: { id: processoOrigemId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    return this.processoConexaoRepository.find({
      where: { processoOrigemId },
      order: { posicao: 'ASC' },
    });
  }

  async removerConexao(
    processoOrigemId: string,
    conexaoId: string,
  ): Promise<ProcessoConexao> {
    const conexao = await this.processoConexaoRepository.findOne({
      where: { id: conexaoId, processoOrigemId },
    });
    if (!conexao) {
      throw new NotFoundException('Conexão não encontrada neste processo');
    }

    conexao.ativo = false;
    return this.processoConexaoRepository.save(conexao);
  }

  async buscarConfiguracoes(processoId: string) {
    const processo = await this.processoRepository.findOne({
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    const fases = await this.faseRepository.find({
      where: { processoId },
      order: { ordem: 'ASC' },
    });

    const faseIds = fases.map((fase) => fase.id);
    const transicoes = faseIds.length
      ? await this.faseTransicaoRepository.find({
          where: { faseOrigemId: In(faseIds) },
        })
      : [];

    return {
      ...this.paraResposta(processo),
      formularioEntrada: processo.formularioEntrada,
      fases: fases.map((fase) => ({
        id: fase.id,
        nome: fase.nome,
        ordem: fase.ordem,
        cor: fase.cor,
        transicoesPermitidas: transicoes
          .filter((transicao) => transicao.faseOrigemId === fase.id)
          .map((transicao) => ({
            id: transicao.id,
            faseDestinoId: transicao.faseDestinoId,
          })),
      })),
    };
  }
}
