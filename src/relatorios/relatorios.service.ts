import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { Card } from '../cards/entities/card.entity';
import { montarPagina, PaginaResultado } from '../common/pagination';
import { avaliarRegra } from '../common/condicao.util';
import {
  OPERADORES_COM_VALOR_FINAL,
  OPERADORES_POR_TIPO_DADO,
  OPERADORES_SEM_VALOR,
} from '../common/enums/condicao.enum';
import {
  ColunaRelatorio,
  FiltroRelatorio,
  RelatorioModelo,
} from './entities/relatorio-modelo.entity';
import { CreateRelatorioModeloDto } from './dto/create-relatorio-modelo.dto';
import { UpdateRelatorioModeloDto } from './dto/update-relatorio-modelo.dto';
import { FormatoExportacaoRelatorio } from './dto/exportar-relatorio-query.dto';
import {
  CampoRelatorioDisponivel,
  montarCatalogoCampos,
} from './relatorio-campo.util';
import { construirCsv } from './relatorio-csv.util';
import { construirPdf } from './relatorio-pdf.util';

// Trava de segurança pra exportação (sem paginação): evita gerar um PDF/CSV
// gigantesco em memória se o processo tiver um volume muito grande de cards.
// A tela normal do relatório (executarConsulta) sempre pagina e não tem esse
// limite.
const LIMITE_LINHAS_EXPORTACAO = 5000;

export interface LinhaRelatorio {
  [campo: string]: unknown;
}

interface DadosPreparados {
  colunasResolvidas: { campo: string; rotulo: string }[];
  faseNomePorId: Map<string, string>;
  cardsFiltrados: Card[];
}

function valorBrutoDoCard(card: Card, campo: string): unknown {
  switch (campo) {
    case 'id':
      return card.id;
    case 'titulo':
      return card.titulo;
    case 'faseAtualId':
      return card.faseAtualId;
    case 'createdAt':
      return card.createdAt;
    case 'updatedAt':
      return card.updatedAt;
    default:
      return card.campos[campo] ?? null;
  }
}

// Igual valorBrutoDoCard, mas resolve pra um valor amigável de exibição —
// hoje só difere pra faseAtualId (mostra o nome da fase, não o uuid cru) e
// pras datas (ISO string em vez de objeto Date). Filtro sempre compara contra
// o valor BRUTO (mais estável/robusto que comparar nome de fase, que muda se
// alguém renomear a fase).
function valorExibicaoDoCard(
  card: Card,
  campo: string,
  faseNomePorId: Map<string, string>,
): unknown {
  if (campo === 'faseAtualId') {
    return faseNomePorId.get(card.faseAtualId) ?? card.faseAtualId;
  }
  const bruto = valorBrutoDoCard(card, campo);
  if (bruto instanceof Date) {
    return bruto.toISOString();
  }
  return bruto;
}

@Injectable()
export class RelatoriosService {
  constructor(
    @InjectRepository(Processo)
    private readonly processoRepository: Repository<Processo>,
    @InjectRepository(Fase)
    private readonly faseRepository: Repository<Fase>,
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
    @InjectRepository(RelatorioModelo)
    private readonly modeloRepository: Repository<RelatorioModelo>,
  ) {}

  private async buscarProcessoOuFalhar(processoId: string): Promise<Processo> {
    const processo = await this.processoRepository.findOne({
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }
    return processo;
  }

  private async buscarFasesOrdenadas(processoId: string): Promise<Fase[]> {
    return this.faseRepository.find({
      where: { processoId },
      order: { ordem: 'ASC' },
    });
  }

  // Catálogo de campos disponíveis pra montar coluna/filtro neste processo —
  // GET .../campos-disponiveis, consumido pelo front pra montar a tela de
  // configuração do modelo (ver relatorio-campo.util.ts). Inclui
  // formularioEntrada + formularioFase de todas as fases do processo.
  async catalogoCampos(
    processoId: string,
  ): Promise<CampoRelatorioDisponivel[]> {
    const processo = await this.buscarProcessoOuFalhar(processoId);
    const fases = await this.buscarFasesOrdenadas(processoId);
    return montarCatalogoCampos(processo, fases);
  }

  private validarEspecificacao(
    catalogoPorCampo: Map<string, CampoRelatorioDisponivel>,
    colunas: ColunaRelatorio[],
    filtros: FiltroRelatorio[],
  ): void {
    if (colunas.length === 0) {
      throw new UnprocessableEntityException(
        'O relatório precisa de ao menos uma coluna',
      );
    }
    for (const coluna of colunas) {
      if (!catalogoPorCampo.has(coluna.campo)) {
        throw new UnprocessableEntityException(
          `Campo de coluna desconhecido: "${coluna.campo}"`,
        );
      }
    }
    for (const filtro of filtros) {
      const info = catalogoPorCampo.get(filtro.campo);
      if (!info) {
        throw new UnprocessableEntityException(
          `Campo de filtro desconhecido: "${filtro.campo}"`,
        );
      }
      if (!info.categoria) {
        throw new UnprocessableEntityException(
          `Campo "${filtro.campo}" não pode ser usado em filtro`,
        );
      }
      if (!OPERADORES_POR_TIPO_DADO[info.categoria].includes(filtro.operador)) {
        throw new UnprocessableEntityException(
          `Operador "${filtro.operador}" inválido para o campo "${filtro.campo}"`,
        );
      }
      if (!OPERADORES_SEM_VALOR.has(filtro.operador) && !('valor' in filtro)) {
        throw new UnprocessableEntityException(
          `Filtro em "${filtro.campo}" precisa de "valor" para o operador ${filtro.operador}`,
        );
      }
      if (
        OPERADORES_COM_VALOR_FINAL.has(filtro.operador) &&
        !('valorFinal' in filtro)
      ) {
        throw new UnprocessableEntityException(
          `Filtro em "${filtro.campo}" precisa de "valorFinal" para o operador ${filtro.operador} (comparação "entre")`,
        );
      }
    }
  }

  private async prepararDados(
    processoId: string,
    colunas: ColunaRelatorio[],
    filtros: FiltroRelatorio[],
  ): Promise<DadosPreparados> {
    const processo = await this.buscarProcessoOuFalhar(processoId);
    const fases = await this.buscarFasesOrdenadas(processoId);
    const catalogo = montarCatalogoCampos(processo, fases);
    const catalogoPorCampo = new Map(catalogo.map((c) => [c.campo, c]));

    this.validarEspecificacao(catalogoPorCampo, colunas, filtros);

    const faseNomePorId = new Map(fases.map((f) => [f.id, f.nome]));

    const cards = await this.cardRepository.find({ where: { processoId } });
    const cardsFiltrados = cards.filter((card) =>
      filtros.every((filtro) => {
        const info = catalogoPorCampo.get(filtro.campo)!;
        const valor = valorBrutoDoCard(card, filtro.campo);
        return avaliarRegra(valor, info.categoria!, filtro);
      }),
    );

    const colunasResolvidas = colunas.map((c) => ({
      campo: c.campo,
      rotulo: c.rotulo ?? catalogoPorCampo.get(c.campo)!.rotulo,
    }));

    return { colunasResolvidas, faseNomePorId, cardsFiltrados };
  }

  private montarLinha(
    card: Card,
    colunas: { campo: string; rotulo: string }[],
    faseNomePorId: Map<string, string>,
  ): LinhaRelatorio {
    const linha: LinhaRelatorio = {};
    for (const coluna of colunas) {
      linha[coluna.campo] = valorExibicaoDoCard(
        card,
        coluna.campo,
        faseNomePorId,
      );
    }
    return linha;
  }

  // Engine única usada tanto pela pré-visualização (especificação avulsa,
  // ainda não salva) quanto pela execução de um modelo salvo. V1: um
  // processo só, filtro em memória (ver decisão na conversa) — sem join
  // pai/filho via ProcessoConexao.
  async executarConsulta(
    processoId: string,
    colunas: ColunaRelatorio[],
    filtros: FiltroRelatorio[],
    page: number,
    perPage: number,
  ): Promise<
    PaginaResultado<LinhaRelatorio> & {
      colunas: { campo: string; rotulo: string }[];
    }
  > {
    const { colunasResolvidas, faseNomePorId, cardsFiltrados } =
      await this.prepararDados(processoId, colunas, filtros);

    const total = cardsFiltrados.length;
    const pagina = cardsFiltrados.slice(
      (page - 1) * perPage,
      (page - 1) * perPage + perPage,
    );
    const linhas = pagina.map((card) =>
      this.montarLinha(card, colunasResolvidas, faseNomePorId),
    );

    return {
      colunas: colunasResolvidas,
      ...montarPagina(linhas, total, page, perPage),
    };
  }

  async exportarConsulta(
    processoId: string,
    nomeRelatorio: string,
    colunas: ColunaRelatorio[],
    filtros: FiltroRelatorio[],
    formato: FormatoExportacaoRelatorio,
  ): Promise<{ conteudo: Buffer; mimeType: string; extensao: string }> {
    const { colunasResolvidas, faseNomePorId, cardsFiltrados } =
      await this.prepararDados(processoId, colunas, filtros);

    const linhas = cardsFiltrados
      .slice(0, LIMITE_LINHAS_EXPORTACAO)
      .map((card) => this.montarLinha(card, colunasResolvidas, faseNomePorId));

    if (formato === FormatoExportacaoRelatorio.CSV) {
      return {
        conteudo: Buffer.from(construirCsv(colunasResolvidas, linhas), 'utf-8'),
        mimeType: 'text/csv; charset=utf-8',
        extensao: 'csv',
      };
    }

    const conteudo = await construirPdf(
      nomeRelatorio,
      colunasResolvidas,
      linhas,
    );
    return { conteudo, mimeType: 'application/pdf', extensao: 'pdf' };
  }

  async listarModelos(processoId: string): Promise<RelatorioModelo[]> {
    await this.buscarProcessoOuFalhar(processoId);
    return this.modeloRepository.find({
      where: { processoId },
      order: { createdAt: 'ASC' },
    });
  }

  async buscarModelo(
    processoId: string,
    modeloId: string,
  ): Promise<RelatorioModelo> {
    const modelo = await this.modeloRepository.findOne({
      where: { id: modeloId, processoId },
    });
    if (!modelo) {
      throw new NotFoundException(
        'Modelo de relatório não encontrado neste processo',
      );
    }
    return modelo;
  }

  async criarModelo(
    processoId: string,
    dto: CreateRelatorioModeloDto,
  ): Promise<RelatorioModelo> {
    const processo = await this.buscarProcessoOuFalhar(processoId);
    const fases = await this.buscarFasesOrdenadas(processoId);
    const catalogoPorCampo = new Map(
      montarCatalogoCampos(processo, fases).map((c) => [c.campo, c]),
    );
    const filtros = dto.filtros ?? [];
    this.validarEspecificacao(catalogoPorCampo, dto.colunas, filtros);

    const modelo = this.modeloRepository.create({
      processoId,
      nome: dto.nome,
      colunas: dto.colunas,
      filtros,
    });
    return this.modeloRepository.save(modelo);
  }

  async atualizarModelo(
    processoId: string,
    modeloId: string,
    dto: UpdateRelatorioModeloDto,
  ): Promise<RelatorioModelo> {
    const modelo = await this.buscarModelo(processoId, modeloId);
    const processo = await this.buscarProcessoOuFalhar(processoId);
    const fases = await this.buscarFasesOrdenadas(processoId);
    const catalogoPorCampo = new Map(
      montarCatalogoCampos(processo, fases).map((c) => [c.campo, c]),
    );

    const colunas = dto.colunas ?? modelo.colunas;
    const filtros = dto.filtros ?? modelo.filtros;
    this.validarEspecificacao(catalogoPorCampo, colunas, filtros);

    if (dto.nome !== undefined) {
      modelo.nome = dto.nome;
    }
    modelo.colunas = colunas;
    modelo.filtros = filtros;
    return this.modeloRepository.save(modelo);
  }

  async removerModelo(processoId: string, modeloId: string): Promise<void> {
    const modelo = await this.buscarModelo(processoId, modeloId);
    await this.modeloRepository.delete(modelo.id);
  }

  async executarModeloSalvo(
    processoId: string,
    modeloId: string,
    page: number,
    perPage: number,
  ) {
    const modelo = await this.buscarModelo(processoId, modeloId);
    return this.executarConsulta(
      processoId,
      modelo.colunas,
      modelo.filtros,
      page,
      perPage,
    );
  }

  async exportarModeloSalvo(
    processoId: string,
    modeloId: string,
    formato: FormatoExportacaoRelatorio,
  ) {
    const modelo = await this.buscarModelo(processoId, modeloId);
    const resultado = await this.exportarConsulta(
      processoId,
      modelo.nome,
      modelo.colunas,
      modelo.filtros,
      formato,
    );
    return {
      ...resultado,
      nomeArquivo: `${modelo.nome}.${resultado.extensao}`,
    };
  }
}
