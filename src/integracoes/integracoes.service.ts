import { randomUUID } from 'crypto';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { ProcessoConexao } from '../processos/entities/processo-conexao.entity';
import { User } from '../users/entities/user.entity';
import { Card } from '../cards/entities/card.entity';
import { AtorEvento } from '../cards/card-evento.helper';
import { PermissoesService } from '../permissoes/permissoes.service';
import { StatusExecucao } from '../automacoes/enums/status-execucao.enum';
import type { AutomacoesService } from '../automacoes/automacoes.service';
import { Integracao } from './entities/integracao.entity';
import { IntegracaoStep } from './entities/integracao-step.entity';
import { IntegracaoConexao } from './entities/integracao-conexao.entity';
import { IntegracaoExecucao } from './entities/integracao-execucao.entity';
import { IntegracaoExecucaoStep } from './entities/integracao-execucao-step.entity';
import { CreateIntegracaoDto } from './dto/create-integracao.dto';
import { UpdateIntegracaoDto } from './dto/update-integracao.dto';
import { CreateIntegracaoStepDto } from './dto/create-integracao-step.dto';
import { CreateIntegracaoConexaoDto } from './dto/create-integracao-conexao.dto';
import {
  StepTipo,
  STEP_TIPOS_GATILHO,
  STEP_TIPOS_TERMINAL,
} from './enums/step-tipo.enum';
import { RAMO_CONDICAO_SENAO } from '../common/enums/condicao.enum';
import {
  RAMO_REPETICAO_ENQUANTO,
  RAMO_REPETICAO_FINALIZADO,
} from './enums/repeticao-ramo.enum';
import { STEP_EXECUTORS } from './step-executors';
import { EmailService } from '../email/email.service';
import { StorageService } from '../storage/storage.service';
import { CardPdfEmissaoService } from '../pdf-modelos/card-pdf-emissao.service';
import { PdfModelo } from '../pdf-modelos/entities/pdf-modelo.entity';
import { Etiqueta } from '../etiquetas/entities/etiqueta.entity';
import {
  CHAVES_PROFUNDAS_POR_STEP,
  CHAVES_SEM_INTERPOLACAO_POR_STEP,
  coletarReferenciasStep,
  ehReferenciaStep,
  resolverConfigStep,
} from './integracao-config.util';
import { NotificacaoEnfileirada } from './notificacao-enfileirada.interface';
import { ArquivoStepReferencia } from './arquivo-step-referencia.interface';

// Formato de resposta pra criar/listar/buscar/atualizar (ver
// comApelidosNasConexoes): igual à entity Integracao, mas cada conexao
// carrega também stepOrigemApelido/stepDestinoApelido — só stepOrigemId/
// stepDestinoId (uuid) não bastam pro front remontar um payload de PATCH,
// que identifica step por apelido, não por id.
export type IntegracaoComApelidos = Omit<Integracao, 'conexoes'> & {
  conexoes: (IntegracaoConexao & {
    stepOrigemApelido: string | null;
    stepDestinoApelido: string | null;
  })[];
};

// Limite de encadeamento compartilhado com o motor de Automacao (ver
// dispararGatilhosCardEntrouNaFase/dispararGatilhosCampoAtualizado em
// card-evento... na verdade em cards/gatilho-dispatch.helper.ts): o mesmo
// `profundidade` passa pelos dois motores, então uma automação disparando
// uma integração disparando outra automação etc. ainda é contado como uma
// cadeia só, protegida no total.
const PROFUNDIDADE_MAXIMA_INTEGRACAO = 5;

@Injectable()
export class IntegracoesService {
  constructor(
    @InjectRepository(Integracao)
    private readonly integracaoRepository: Repository<Integracao>,
    @InjectRepository(IntegracaoStep)
    private readonly stepRepository: Repository<IntegracaoStep>,
    @InjectRepository(Processo)
    private readonly processoRepository: Repository<Processo>,
    @InjectRepository(Fase)
    private readonly faseRepository: Repository<Fase>,
    @InjectRepository(ProcessoConexao)
    private readonly processoConexaoRepository: Repository<ProcessoConexao>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(IntegracaoExecucao)
    private readonly execucaoRepository: Repository<IntegracaoExecucao>,
    private readonly permissoesService: PermissoesService,
    private readonly emailService: EmailService,
    private readonly storageService: StorageService,
    private readonly cardPdfEmissaoService: CardPdfEmissaoService,
    @InjectRepository(PdfModelo)
    private readonly pdfModeloRepository: Repository<PdfModelo>,
    @InjectRepository(Etiqueta)
    private readonly etiquetaRepository: Repository<Etiqueta>,
    private readonly dataSource: DataSource,
  ) {}

  // GET/POST/PATCH sempre devolvem `conexoes` com stepOrigemApelido/
  // stepDestinoApelido além de stepOrigemId/stepDestinoId — sem isso, o
  // front precisaria cruzar `steps[].id` manualmente pra saber qual apelido
  // cada conexão liga, só pra poder remontar o payload de PATCH (que exige
  // apelido, não id — ver CreateIntegracaoConexaoDto). Ponto único porque as
  // 4 operações (listar/buscar/criar/atualizar) retornam o mesmo formato.
  private comApelidosNasConexoes(
    integracao: Integracao,
  ): IntegracaoComApelidos {
    const apelidoPorId = new Map(
      integracao.steps.map((s) => [s.id, s.apelido]),
    );
    return {
      ...integracao,
      conexoes: integracao.conexoes.map((conexao) => ({
        ...conexao,
        stepOrigemApelido: apelidoPorId.get(conexao.stepOrigemId) ?? null,
        stepDestinoApelido: apelidoPorId.get(conexao.stepDestinoId) ?? null,
      })),
    };
  }

  // Staging pro step ACAO_ANEXAR_ARQUIVO: o arquivo precisa existir ANTES do
  // step (config é jsonb — não guarda binário), mas o step também precisa
  // existir antes de ter um id/apelido consultável — por isso a chave de
  // armazenamento é derivada só do processoId, nunca de um step em
  // particular. O front sobe cada arquivo aqui, pega o objectKey de volta e
  // inclui em config.arquivos ao criar/editar o step (ver create-integracao-
  // step.dto.ts e STEP_EXECUTORS[ACAO_ANEXAR_ARQUIVO] em step-executors.ts).
  async uploadArquivoStep(
    processoId: string,
    arquivo: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ): Promise<ArquivoStepReferencia> {
    const processo = await this.processoRepository.findOne({
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    const objectKey = `integracoes/${processoId}/steps-arquivos/${randomUUID()}-${arquivo.originalname}`;
    await this.storageService.salvar(
      objectKey,
      arquivo.buffer,
      arquivo.mimetype,
    );

    return {
      objectKey,
      nomeOriginal: arquivo.originalname,
      mimeType: arquivo.mimetype,
      tamanho: arquivo.size,
    };
  }

  async listarPorProcesso(
    processoId: string,
  ): Promise<IntegracaoComApelidos[]> {
    const processo = await this.processoRepository.findOne({
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    const integracoes = await this.integracaoRepository.find({
      where: { processoId },
      relations: { steps: true, conexoes: true },
      order: { createdAt: 'ASC' },
    });
    return integracoes.map((i) => this.comApelidosNasConexoes(i));
  }

  async buscar(
    processoId: string,
    integracaoId: string,
  ): Promise<IntegracaoComApelidos> {
    const integracao = await this.integracaoRepository.findOne({
      where: { id: integracaoId, processoId },
      relations: { steps: true, conexoes: true },
    });
    if (!integracao) {
      throw new NotFoundException('Integração não encontrada neste processo');
    }
    return this.comApelidosNasConexoes(integracao);
  }

  async criar(
    processoId: string,
    dto: CreateIntegracaoDto,
  ): Promise<IntegracaoComApelidos> {
    const processo = await this.processoRepository.findOne({
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    await this.validarGrafo(processoId, dto.steps, dto.conexoes);

    const { steps, conexoes } = this.montarStepsEConexoes(
      dto.steps,
      dto.conexoes,
    );

    const integracao = this.integracaoRepository.create({
      processoId,
      nome: dto.nome,
      ativo: dto.ativo ?? true,
      steps,
      conexoes,
    });
    const salva = await this.integracaoRepository.save(integracao);
    return this.comApelidosNasConexoes(salva);
  }

  // PATCH parcial, mesmo padrão de AutomacoesService.atualizar: `steps` e
  // `conexoes` sempre juntos (o grafo é substituído inteiro, nunca em parte,
  // já que conexões dependem dos apelidos dos steps daquele envio).
  async atualizar(
    processoId: string,
    integracaoId: string,
    dto: UpdateIntegracaoDto,
  ): Promise<IntegracaoComApelidos> {
    const integracao = await this.integracaoRepository.findOne({
      where: { id: integracaoId, processoId },
      relations: { steps: true, conexoes: true },
    });
    if (!integracao) {
      throw new NotFoundException('Integração não encontrada neste processo');
    }

    if (dto.nome !== undefined) {
      integracao.nome = dto.nome;
    }
    if (dto.ativo !== undefined) {
      integracao.ativo = dto.ativo;
    }

    if (dto.steps !== undefined) {
      if (dto.conexoes === undefined) {
        throw new UnprocessableEntityException(
          'conexoes é obrigatório junto de steps (o grafo é substituído inteiro)',
        );
      }
      await this.validarGrafo(processoId, dto.steps, dto.conexoes);
      await this.stepRepository.delete({ integracaoId });

      const { steps, conexoes } = this.montarStepsEConexoes(
        dto.steps,
        dto.conexoes,
      );
      integracao.steps = steps;
      integracao.conexoes = conexoes;
    }

    const salva = await this.integracaoRepository.save(integracao);
    return this.comApelidosNasConexoes(salva);
  }

  async remover(processoId: string, integracaoId: string): Promise<void> {
    const integracao = await this.integracaoRepository.findOne({
      where: { id: integracaoId, processoId },
    });
    if (!integracao) {
      throw new NotFoundException('Integração não encontrada neste processo');
    }
    // Steps e conexões somem em cascata (onDelete: CASCADE). O histórico em
    // integracao_execucoes sobrevive com integracaoId = null (SET NULL).
    await this.integracaoRepository.delete(integracaoId);
  }

  async listarExecucoesPorCard(cardId: string): Promise<IntegracaoExecucao[]> {
    return this.execucaoRepository.find({
      where: { cardId },
      relations: { steps: true },
      order: { executadoEm: 'DESC', steps: { executadoEm: 'ASC' } },
    });
  }

  async listarExecucoesPorIntegracao(
    integracaoId: string,
  ): Promise<IntegracaoExecucao[]> {
    return this.execucaoRepository.find({
      where: { integracaoId },
      relations: { steps: true },
      order: { executadoEm: 'DESC', steps: { executadoEm: 'ASC' } },
    });
  }

  // Gera ids client-side (em vez de deixar o Postgres gerar) pra poder
  // montar IntegracaoConexao.stepOrigemId/stepDestinoId (que referenciam
  // steps do MESMO payload) num único objeto e salvar tudo de uma vez via
  // cascade — sem precisar de duas idas ao banco.
  private montarStepsEConexoes(
    stepsDto: CreateIntegracaoStepDto[],
    conexoesDto: CreateIntegracaoConexaoDto[],
  ): { steps: IntegracaoStep[]; conexoes: IntegracaoConexao[] } {
    const idPorApelido = new Map<string, string>();
    const steps = stepsDto.map((s) => {
      const id = randomUUID();
      idPorApelido.set(s.apelido, id);
      return Object.assign(new IntegracaoStep(), {
        id,
        apelido: s.apelido,
        tipo: s.tipo,
        config: s.config,
        usuarioServicoId: s.usuarioServicoId ?? null,
        posicaoX: s.posicaoX ?? 0,
        posicaoY: s.posicaoY ?? 0,
      });
    });
    const conexoes = conexoesDto.map((c) =>
      Object.assign(new IntegracaoConexao(), {
        stepOrigemId: idPorApelido.get(c.stepOrigemApelido),
        stepDestinoId: idPorApelido.get(c.stepDestinoApelido),
        ramoOrigem: c.ramoOrigem ?? null,
      }),
    );
    return { steps, conexoes };
  }

  // Valida: apelidos únicos, ao menos um gatilho, conexões referenciando
  // apelidos existentes, gatilho sem entrada, grafo acíclico (Kahn), conta de
  // serviço obrigatória em todo step de ação, config de cada step (via
  // registry) e que todo $stepRef usado em config corresponda a uma conexão
  // de verdade.
  private async validarGrafo(
    processoId: string,
    steps: CreateIntegracaoStepDto[],
    conexoes: CreateIntegracaoConexaoDto[],
  ): Promise<void> {
    const apelidos = steps.map((s) => s.apelido);
    if (new Set(apelidos).size !== apelidos.length) {
      throw new UnprocessableEntityException(
        'Apelidos de step não podem repetir dentro da integração',
      );
    }
    const apelidoSet = new Set(apelidos);

    if (!steps.some((s) => STEP_TIPOS_GATILHO.has(s.tipo))) {
      throw new UnprocessableEntityException(
        'A integração precisa de ao menos um step de gatilho (ex.: GATILHO_CARD_ENTROU_NA_FASE, GATILHO_CAMPO_ATUALIZADO, GATILHO_CARD_CRIADO, GATILHO_CARD_VENCIDO)',
      );
    }

    const gatilhoApelidos = new Set(
      steps.filter((s) => STEP_TIPOS_GATILHO.has(s.tipo)).map((s) => s.apelido),
    );
    for (const conexao of conexoes) {
      if (!apelidoSet.has(conexao.stepOrigemApelido)) {
        throw new UnprocessableEntityException(
          `Conexão referencia stepOrigemApelido inexistente: ${conexao.stepOrigemApelido}`,
        );
      }
      if (!apelidoSet.has(conexao.stepDestinoApelido)) {
        throw new UnprocessableEntityException(
          `Conexão referencia stepDestinoApelido inexistente: ${conexao.stepDestinoApelido}`,
        );
      }
      if (gatilhoApelidos.has(conexao.stepDestinoApelido)) {
        throw new UnprocessableEntityException(
          `Step de gatilho "${conexao.stepDestinoApelido}" não pode receber conexão de entrada`,
        );
      }
    }

    // Steps terminais (ver STEP_TIPOS_TERMINAL — hoje só EMAIL) não podem
    // alimentar outro step: o resultado real só existe depois que o job em
    // segundo plano roda, fora desta execução.
    const stepTipoPorApelido = new Map(steps.map((s) => [s.apelido, s.tipo]));
    for (const conexao of conexoes) {
      const tipoOrigem = stepTipoPorApelido.get(conexao.stepOrigemApelido);
      if (tipoOrigem && STEP_TIPOS_TERMINAL.has(tipoOrigem)) {
        throw new UnprocessableEntityException(
          `Step "${conexao.stepOrigemApelido}" (${tipoOrigem}) é terminal e não pode ter conexão de saída`,
        );
      }
    }

    this.verificarAciclico(apelidos, conexoes);

    // Um REPETICAO tem dois ramos de saída fixos (ver enums/repeticao-ramo.
    // enum.ts): ENQUANTO (o "corpo", reexecutado a cada iteração) e
    // FINALIZADO (roda uma vez só, depois que todas as iterações do corpo
    // já terminaram). Dois cuidados aqui, análogos ao que CONDICAO já teria
    // se dois ramos pudessem se sobrepor: (1) nenhum step pode ser
    // alcançável pelos dois ramos ao mesmo tempo — senão ficaria ambíguo se
    // ele repete ou roda uma vez; (2) nenhum step do corpo (ENQUANTO) pode
    // receber conexão de fora dele, senão ficaria ambíguo quantas vezes ele
    // deveria rodar. O ramo FINALIZADO não tem essa segunda restrição — os
    // steps ligados a ele se comportam como qualquer step normal depois de
    // um CONDICAO, podendo inclusive ter outras entradas.
    for (const step of steps) {
      if (step.tipo !== StepTipo.REPETICAO) {
        continue;
      }
      const corpoEnquanto = this.calcularCorpoRepeticaoPorApelido(
        step.apelido,
        RAMO_REPETICAO_ENQUANTO,
        conexoes,
      );
      const corpoFinalizado = this.calcularCorpoRepeticaoPorApelido(
        step.apelido,
        RAMO_REPETICAO_FINALIZADO,
        conexoes,
      );

      for (const apelido of corpoEnquanto) {
        if (corpoFinalizado.has(apelido)) {
          throw new UnprocessableEntityException(
            `Step "${apelido}" é alcançável tanto pelo ramo ENQUANTO quanto pelo FINALIZADO do step de repetição "${step.apelido}" — isso deixaria ambíguo se ele repete ou roda uma vez só`,
          );
        }
      }

      for (const conexao of conexoes) {
        if (!corpoEnquanto.has(conexao.stepDestinoApelido)) {
          continue;
        }
        const origemPermitida =
          (conexao.stepOrigemApelido === step.apelido &&
            conexao.ramoOrigem === RAMO_REPETICAO_ENQUANTO) ||
          corpoEnquanto.has(conexao.stepOrigemApelido);
        if (!origemPermitida) {
          throw new UnprocessableEntityException(
            `Step "${conexao.stepDestinoApelido}" está no corpo (ramo ENQUANTO) do step de repetição "${step.apelido}" mas recebe conexão de "${conexao.stepOrigemApelido}", que está fora desse corpo — isso deixaria ambíguo quantas vezes ele deveria rodar`,
          );
        }
      }
    }

    for (const step of steps) {
      if (!STEP_TIPOS_GATILHO.has(step.tipo) && !step.usuarioServicoId) {
        throw new UnprocessableEntityException(
          `Step "${step.apelido}" (${step.tipo}) exige usuarioServicoId — nenhum step de ação roda sem uma conta de serviço configurada`,
        );
      }
      if (step.usuarioServicoId) {
        const usuario = await this.userRepository.findOne({
          where: { id: step.usuarioServicoId },
        });
        if (!usuario) {
          throw new NotFoundException(
            `usuarioServicoId do step "${step.apelido}" não corresponde a um usuário existente`,
          );
        }
      }
    }

    // $stepRef pode apontar pra QUALQUER step ancestral (não só o predecessor
    // direto) — saidasPorApelido, em executarSequencia, já acumula a saída de
    // todo step executado antes na mesma cadeia, não só do vizinho conectado
    // direto (ver conversa). "Ancestral" = alcançável andando pra trás pelas
    // conexões a partir do step que referencia.
    const ancestraisPorApelido = this.calcularAncestraisPorApelido(
      apelidos,
      conexoes,
    );

    for (const step of steps) {
      const executor = STEP_EXECUTORS[step.tipo];
      if (!executor) {
        throw new UnprocessableEntityException(
          `Tipo de step não suportado: ${step.tipo}`,
        );
      }
      await executor.validarConfig(processoId, step.config, {
        faseRepository: this.faseRepository,
        processoConexaoRepository: this.processoConexaoRepository,
        userRepository: this.userRepository,
        emailService: this.emailService,
        pdfModeloRepository: this.pdfModeloRepository,
        etiquetaRepository: this.etiquetaRepository,
      });

      const ancestrais =
        ancestraisPorApelido.get(step.apelido) ?? new Set<string>();
      const chavesProfundas = CHAVES_PROFUNDAS_POR_STEP[step.tipo];
      for (const [chave, valor] of Object.entries(step.config)) {
        const referencias = chavesProfundas?.has(chave)
          ? coletarReferenciasStep(valor)
          : ehReferenciaStep(valor)
            ? [valor]
            : [];
        for (const referencia of referencias) {
          if (!ancestrais.has(referencia.$stepRef)) {
            throw new UnprocessableEntityException(
              `Step "${step.apelido}" referencia "${referencia.$stepRef}" em config, mas esse step não roda antes dele no grafo (não é um ancestral)`,
            );
          }
        }
      }
    }

    // Roda depois do loop acima (steps já validados individualmente), pra
    // poder confiar que config.ramos de todo step CONDICAO já tem o formato
    // certo. ramoOrigem só faz sentido saindo de um CONDICAO ou REPETICAO —
    // nos outros tipos a conexão continua puramente estrutural (sempre
    // "ativa").
    const stepPorApelido = new Map(steps.map((s) => [s.apelido, s]));
    for (const conexao of conexoes) {
      const origem = stepPorApelido.get(conexao.stepOrigemApelido)!;
      if (origem.tipo === StepTipo.CONDICAO) {
        const ramosConfig =
          (origem.config as { ramos?: { id: string }[] }).ramos ?? [];
        const idsValidos = new Set([
          RAMO_CONDICAO_SENAO,
          ...ramosConfig.map((r) => r.id),
        ]);
        if (!conexao.ramoOrigem || !idsValidos.has(conexao.ramoOrigem)) {
          throw new UnprocessableEntityException(
            `Conexão saindo do step de condição "${conexao.stepOrigemApelido}" precisa de "ramoOrigem" com um dos ids configurados em ramos, ou "${RAMO_CONDICAO_SENAO}"`,
          );
        }
      } else if (origem.tipo === StepTipo.REPETICAO) {
        if (
          conexao.ramoOrigem !== RAMO_REPETICAO_ENQUANTO &&
          conexao.ramoOrigem !== RAMO_REPETICAO_FINALIZADO
        ) {
          throw new UnprocessableEntityException(
            `Conexão saindo do step de repetição "${conexao.stepOrigemApelido}" precisa de "ramoOrigem" igual a "${RAMO_REPETICAO_ENQUANTO}" (corpo, repete) ou "${RAMO_REPETICAO_FINALIZADO}" (roda uma vez, ao final)`,
          );
        }
      } else if (conexao.ramoOrigem) {
        throw new UnprocessableEntityException(
          `Conexão saindo de "${conexao.stepOrigemApelido}" não pode ter "ramoOrigem" — esse campo só se aplica a conexões saindo de um step CONDICAO ou REPETICAO`,
        );
      }
    }
  }

  private verificarAciclico(
    apelidos: string[],
    conexoes: CreateIntegracaoConexaoDto[],
  ): void {
    const grauEntrada = new Map<string, number>(apelidos.map((a) => [a, 0]));
    const adjacencia = new Map<string, string[]>(apelidos.map((a) => [a, []]));
    for (const conexao of conexoes) {
      adjacencia
        .get(conexao.stepOrigemApelido)
        ?.push(conexao.stepDestinoApelido);
      grauEntrada.set(
        conexao.stepDestinoApelido,
        (grauEntrada.get(conexao.stepDestinoApelido) ?? 0) + 1,
      );
    }
    const fila = apelidos.filter((a) => grauEntrada.get(a) === 0);
    let processados = 0;
    while (fila.length > 0) {
      const atual = fila.shift()!;
      processados++;
      for (const vizinho of adjacencia.get(atual) ?? []) {
        grauEntrada.set(vizinho, grauEntrada.get(vizinho)! - 1);
        if (grauEntrada.get(vizinho) === 0) {
          fila.push(vizinho);
        }
      }
    }
    if (processados !== apelidos.length) {
      throw new UnprocessableEntityException(
        'O grafo de steps contém um ciclo',
      );
    }
  }

  // BFS a partir dos destinos diretos de um ramo específico saindo de
  // `stepApelido` (ex.: tudo alcançável pelo ramo ENQUANTO de um REPETICAO)
  // — trabalhando com apelido em vez de id porque roda em validarGrafo,
  // ANTES de montarStepsEConexoes gerar os ids de verdade. Não inclui o
  // próprio `stepApelido` (diferente de calcularAlcancaveis, que inclui a
  // raiz) — aqui só interessa o que está "depois" daquele ramo.
  private calcularCorpoRepeticaoPorApelido(
    stepApelido: string,
    ramo: string,
    conexoes: CreateIntegracaoConexaoDto[],
  ): Set<string> {
    const adjacencia = new Map<string, string[]>();
    for (const conexao of conexoes) {
      const lista = adjacencia.get(conexao.stepOrigemApelido) ?? [];
      lista.push(conexao.stepDestinoApelido);
      adjacencia.set(conexao.stepOrigemApelido, lista);
    }
    const destinosDiretos = conexoes
      .filter(
        (c) => c.stepOrigemApelido === stepApelido && c.ramoOrigem === ramo,
      )
      .map((c) => c.stepDestinoApelido);
    const visitados = new Set<string>(destinosDiretos);
    const fila = [...destinosDiretos];
    while (fila.length > 0) {
      const atual = fila.shift()!;
      for (const vizinho of adjacencia.get(atual) ?? []) {
        if (!visitados.has(vizinho)) {
          visitados.add(vizinho);
          fila.push(vizinho);
        }
      }
    }
    return visitados;
  }

  // Pra cada step, o conjunto de apelidos que rodam antes dele por QUALQUER
  // caminho no grafo (não só o predecessor direto) — usado pra validar
  // $stepRef em validarGrafo. BFS andando pra trás (destino -> origem) a
  // partir de cada step; O(apelidos × conexões) no pior caso, irrelevante
  // pro tamanho de grafo que uma integração real tem.
  private calcularAncestraisPorApelido(
    apelidos: string[],
    conexoes: CreateIntegracaoConexaoDto[],
  ): Map<string, Set<string>> {
    const origensDiretasPorDestino = new Map<string, string[]>();
    for (const conexao of conexoes) {
      const lista =
        origensDiretasPorDestino.get(conexao.stepDestinoApelido) ?? [];
      lista.push(conexao.stepOrigemApelido);
      origensDiretasPorDestino.set(conexao.stepDestinoApelido, lista);
    }

    const ancestraisPorApelido = new Map<string, Set<string>>();
    for (const apelido of apelidos) {
      const visitados = new Set<string>();
      const fila = [...(origensDiretasPorDestino.get(apelido) ?? [])];
      while (fila.length > 0) {
        const atual = fila.shift()!;
        if (visitados.has(atual)) {
          continue;
        }
        visitados.add(atual);
        for (const origem of origensDiretasPorDestino.get(atual) ?? []) {
          if (!visitados.has(origem)) {
            fila.push(origem);
          }
        }
      }
      ancestraisPorApelido.set(apelido, visitados);
    }
    return ancestraisPorApelido;
  }

  // Checagem de permissão de uma conta de serviço contra um processoId —
  // pública porque steps com `permissaoNoExecutor` (ver step-executor.
  // interface.ts) chamam isto de dentro do próprio `executar`, depois de
  // resolver dinamicamente qual processo é o relevante (ex.: CONSULTA_CARD
  // aponta pra um card que pode ser de outro processo). Replica o mesmo
  // bypass de isSuperAdmin que PermissoesGuard faz pra requests HTTP — aqui
  // precisa ser manual porque a execução de step não passa pelo guard.
  async verificarPermissaoServico(
    usuarioServicoId: string,
    alias: string,
    processoId: string,
  ): Promise<boolean> {
    const usuarioServico = await this.userRepository.findOne({
      where: { id: usuarioServicoId },
    });
    // Conta de serviço bloqueada nunca executa nada, nem se for super admin
    // — bloqueio é pra invalidar TODO uso do usuário, não só login/HTTP.
    if (!usuarioServico || usuarioServico.bloqueado) {
      return false;
    }
    if (usuarioServico.isSuperAdmin) {
      return true;
    }
    return this.permissoesService.usuarioTemPermissao(
      usuarioServicoId,
      alias,
      processoId,
    );
  }

  private verificarProfundidade(profundidade: number): void {
    if (profundidade >= PROFUNDIDADE_MAXIMA_INTEGRACAO) {
      throw new UnprocessableEntityException(
        'Limite de encadeamento de integrações excedido (possível loop entre automações/integrações)',
      );
    }
  }

  // Chamado por dispararGatilhoIntegracaoCardCriado (cards/gatilho-dispatch.
  // helper.ts) dentro da MESMA transação da criação do card. Só existe no
  // motor de Integracao (ver enums/step-tipo.enum.ts) — sem equivalente em
  // AutomacoesService. `ator` é repassado como veio de criarCardEmFase (o
  // autor de verdade), porque STEP_EXECUTORS[GATILHO_CARD_CRIADO] expõe
  // quem criou o card na saída do step.
  async executarGatilhoCardCriado(
    manager: EntityManager,
    card: Card,
    ator: AtorEvento,
    automacoesService: AutomacoesService,
    cardsCriados?: Card[],
    profundidade = 0,
    cardsAtualizados?: Map<string, Card>,
    emailsEnfileirados?: string[],
    notificacoesEnfileiradas?: NotificacaoEnfileirada[],
  ): Promise<void> {
    this.verificarProfundidade(profundidade);

    const integracoes = await manager.find(Integracao, {
      where: { processoId: card.processoId, ativo: true },
      relations: { steps: true, conexoes: true },
    });

    for (const integracao of integracoes) {
      const raizes = integracao.steps.filter(
        (s) => s.tipo === StepTipo.GATILHO_CARD_CRIADO,
      );
      for (const raiz of raizes) {
        await this.executarGrafo(
          manager,
          integracao,
          raiz,
          card,
          StepTipo.GATILHO_CARD_CRIADO,
          ator,
          automacoesService,
          cardsCriados,
          profundidade,
          cardsAtualizados,
          emailsEnfileirados,
          notificacoesEnfileiradas,
        );
      }
    }
  }

  // Chamado por dispararGatilhosCardEntrouNaFase (cards/gatilho-dispatch.
  // helper.ts) dentro da MESMA transação da operação que disparou o evento.
  async executarGatilhoCardEntrouNaFase(
    manager: EntityManager,
    card: Card,
    faseId: string,
    automacoesService: AutomacoesService,
    cardsCriados?: Card[],
    profundidade = 0,
    cardsAtualizados?: Map<string, Card>,
    emailsEnfileirados?: string[],
    notificacoesEnfileiradas?: NotificacaoEnfileirada[],
  ): Promise<void> {
    this.verificarProfundidade(profundidade);

    const integracoes = await manager.find(Integracao, {
      where: { processoId: card.processoId, ativo: true },
      relations: { steps: true, conexoes: true },
    });

    for (const integracao of integracoes) {
      const raizes = integracao.steps.filter(
        (s) =>
          s.tipo === StepTipo.GATILHO_CARD_ENTROU_NA_FASE &&
          (s.config as { faseId?: string })?.faseId === faseId,
      );
      for (const raiz of raizes) {
        await this.executarGrafo(
          manager,
          integracao,
          raiz,
          card,
          StepTipo.GATILHO_CARD_ENTROU_NA_FASE,
          { usuarioId: null, automatico: true },
          automacoesService,
          cardsCriados,
          profundidade,
          cardsAtualizados,
          emailsEnfileirados,
          notificacoesEnfileiradas,
        );
      }
    }
  }

  // GATILHO_CARD_VENCIDO / GATILHO_CARD_PRESTES_A_VENCER: chamado pelo job de
  // background (GatilhoExecucaoProcessor), disparado pela varredura de
  // src/vencimentos. Sem config nos steps: vale pra todo card do processo.
  async executarGatilhoVencimento(
    manager: EntityManager,
    card: Card,
    tipoGatilho:
      StepTipo.GATILHO_CARD_VENCIDO | StepTipo.GATILHO_CARD_PRESTES_A_VENCER,
    automacoesService: AutomacoesService,
    cardsCriados?: Card[],
    profundidade = 0,
    cardsAtualizados?: Map<string, Card>,
    emailsEnfileirados?: string[],
    notificacoesEnfileiradas?: NotificacaoEnfileirada[],
  ): Promise<void> {
    this.verificarProfundidade(profundidade);

    const integracoes = await manager.find(Integracao, {
      where: { processoId: card.processoId, ativo: true },
      relations: { steps: true, conexoes: true },
    });

    for (const integracao of integracoes) {
      const raizes = integracao.steps.filter((s) => s.tipo === tipoGatilho);
      for (const raiz of raizes) {
        await this.executarGrafo(
          manager,
          integracao,
          raiz,
          card,
          tipoGatilho,
          { usuarioId: null, automatico: true },
          automacoesService,
          cardsCriados,
          profundidade,
          cardsAtualizados,
          emailsEnfileirados,
          notificacoesEnfileiradas,
        );
      }
    }
  }

  async executarGatilhoCampoAtualizado(
    manager: EntityManager,
    card: Card,
    camposAlterados: string[],
    automacoesService: AutomacoesService,
    cardsCriados?: Card[],
    profundidade = 0,
    cardsAtualizados?: Map<string, Card>,
    emailsEnfileirados?: string[],
    notificacoesEnfileiradas?: NotificacaoEnfileirada[],
  ): Promise<void> {
    if (camposAlterados.length === 0) {
      return;
    }
    this.verificarProfundidade(profundidade);

    const camposSet = new Set(camposAlterados);
    const integracoes = await manager.find(Integracao, {
      where: { processoId: card.processoId, ativo: true },
      relations: { steps: true, conexoes: true },
    });

    for (const integracao of integracoes) {
      const raizes = integracao.steps.filter(
        (s) =>
          s.tipo === StepTipo.GATILHO_CAMPO_ATUALIZADO &&
          camposSet.has((s.config as { campo?: string })?.campo ?? ''),
      );
      for (const raiz of raizes) {
        await this.executarGrafo(
          manager,
          integracao,
          raiz,
          card,
          StepTipo.GATILHO_CAMPO_ATUALIZADO,
          { usuarioId: null, automatico: true },
          automacoesService,
          cardsCriados,
          profundidade,
          cardsAtualizados,
          emailsEnfileirados,
          notificacoesEnfileiradas,
        );
      }
    }
  }

  // Roda, em ordem topológica, todo step alcançável a partir de `raiz` —
  // grava um IntegracaoExecucao + um IntegracaoExecucaoStep por step rodado.
  // Falha em qualquer step propaga o erro (derruba a transação inteira,
  // igual ao motor de Automacao, desfazendo os efeitos colaterais da
  // execução) — mas a linha de auditoria ERRO é gravada à parte, numa
  // transação independente (ver registrarExecucaoErroForaDaTransacao),
  // então sobrevive ao rollback pro gerente do processo poder revisar.
  private async executarGrafo(
    manager: EntityManager,
    integracao: Integracao,
    raiz: IntegracaoStep,
    card: Card,
    gatilhoTipo: StepTipo,
    ator: AtorEvento,
    automacoesService: AutomacoesService,
    cardsCriados: Card[] | undefined,
    profundidade: number,
    cardsAtualizados: Map<string, Card> | undefined,
    emailsEnfileirados: string[] | undefined,
    notificacoesEnfileiradas: NotificacaoEnfileirada[] | undefined,
  ): Promise<void> {
    const alcancaveis = this.calcularAlcancaveis(integracao, raiz.id);
    const ordem = this.ordenarTopologicamente(integracao, alcancaveis);

    // Conexões de entrada de cada step (restritas ao subgrafo alcançável),
    // pra decidir em ordem topológica se ele deve rodar ou ser pulado.
    const conexoesPorDestino = new Map<string, IntegracaoConexao[]>();
    for (const conexao of integracao.conexoes) {
      if (
        alcancaveis.has(conexao.stepOrigemId) &&
        alcancaveis.has(conexao.stepDestinoId)
      ) {
        const lista = conexoesPorDestino.get(conexao.stepDestinoId) ?? [];
        lista.push(conexao);
        conexoesPorDestino.set(conexao.stepDestinoId, lista);
      }
    }

    // Construído em memória e só vira entidade (manager.create) no final,
    // depois de já ter todos os itens — passar um array vazio pro
    // relacionamento e ir mutando-o depois não é confiável (TypeORM pode
    // copiar o array em vez de manter a mesma referência). Compartilhado por
    // toda a execução, incluindo cada iteração de um eventual REPETICAO —
    // uma linha por step efetivamente rodado ou pulado, em qualquer volta.
    const stepsExecutados: IntegracaoExecucaoStep[] = [];

    let statusFinal = StatusExecucao.SUCESSO;
    let detalheFinal: Record<string, unknown> | null = null;

    try {
      await this.executarSequencia({
        manager,
        integracao,
        ordem,
        raizId: raiz.id,
        conexoesPorDestino,
        executadosSet: new Set<string>(),
        ramoAtivoPorStepId: new Map<string, string>(),
        saidasPorApelido: new Map<string, Record<string, unknown>>(),
        stepsExecutados,
        card,
        ator,
        automacoesService,
        cardsCriados,
        profundidade,
        cardsAtualizados,
        emailsEnfileirados,
        notificacoesEnfileiradas,
        camposExtras: {},
      });
      await manager.save(
        manager.create(IntegracaoExecucao, {
          integracaoId: integracao.id,
          cardId: card.id,
          gatilhoTipo,
          status: statusFinal,
          detalhe: detalheFinal,
          steps: stepsExecutados,
        }),
      );
    } catch (erro) {
      statusFinal = StatusExecucao.ERRO;
      detalheFinal = { mensagem: (erro as Error).message };
      // Gravado numa transação própria (nova conexão), não na `manager`
      // recebida — essa vai sofrer rollback por causa deste mesmo erro, e
      // levaria a linha de auditoria junto se ela fosse escrita ali. Sem
      // isso, um erro de integração fica completamente invisível pro
      // gerente do processo.
      await this.registrarExecucaoErroForaDaTransacao(
        integracao,
        card,
        gatilhoTipo,
        stepsExecutados,
        detalheFinal,
      );
      throw erro;
    }
  }

  // Roda, em ordem topológica, uma sequência de steps — usado tanto pra
  // execução principal do grafo (chamada por executarGrafo, raizId = a raiz
  // de verdade do gatilho) quanto, recursivamente, uma vez por iteração do
  // corpo de cada step REPETICAO encontrado no caminho (raizId = o próprio
  // REPETICAO, já marcado como executado por quem chamou — ver mais abaixo).
  //
  // Steps que pertencem ao corpo de algum REPETICAO desta sequência são
  // excluídos de `ordem` antes do loop principal: eles só rodam através da
  // chamada recursiva feita quando o REPETICAO é alcançado, uma vez por
  // iteração — nunca direto neste loop, senão rodariam uma vez a mais (fora
  // do loop) além das `quantidade` vezes de verdade.
  private async executarSequencia(params: {
    manager: EntityManager;
    integracao: Integracao;
    ordem: IntegracaoStep[];
    raizId: string;
    conexoesPorDestino: Map<string, IntegracaoConexao[]>;
    executadosSet: Set<string>;
    ramoAtivoPorStepId: Map<string, string>;
    saidasPorApelido: Map<string, Record<string, unknown>>;
    stepsExecutados: IntegracaoExecucaoStep[];
    card: Card;
    ator: AtorEvento;
    automacoesService: AutomacoesService;
    cardsCriados: Card[] | undefined;
    profundidade: number;
    cardsAtualizados: Map<string, Card> | undefined;
    emailsEnfileirados: string[] | undefined;
    notificacoesEnfileiradas: NotificacaoEnfileirada[] | undefined;
    // Chaves extras injetadas junto de card.campos na hora de interpolar
    // config de string ({chave}) — hoje só repeticaoIndice, escrito pela
    // própria iteração do REPETICAO mais próximo (o de dentro ganha, se
    // aninhado).
    camposExtras: Record<string, unknown>;
  }): Promise<void> {
    const {
      manager,
      integracao,
      ordem: ordemCompleta,
      raizId,
      conexoesPorDestino,
      executadosSet,
      ramoAtivoPorStepId,
      saidasPorApelido,
      stepsExecutados,
      card,
      ator,
      automacoesService,
      cardsCriados,
      profundidade,
      cardsAtualizados,
      emailsEnfileirados,
      notificacoesEnfileiradas,
      camposExtras,
    } = params;

    // Só o ramo ENQUANTO (o "corpo" que repete) sai do loop plano abaixo —
    // o ramo FINALIZADO continua nele normalmente, ativado como um ramo
    // comum de CONDICAO seria (ver bloco StepTipo.REPETICAO mais abaixo).
    const corpoDeRepeticao = new Set<string>();
    for (const step of ordemCompleta) {
      if (step.tipo === StepTipo.REPETICAO) {
        const corpo = this.calcularCorpoRepeticao(
          integracao,
          step.id,
          RAMO_REPETICAO_ENQUANTO,
        );
        for (const id of corpo) {
          corpoDeRepeticao.add(id);
        }
      }
    }
    const ordem = ordemCompleta.filter(
      (step) => !corpoDeRepeticao.has(step.id),
    );

    for (const step of ordem) {
      // Um step roda se for a raiz, ou se pelo menos uma de suas conexões
      // de entrada estiver "ativa" (origem executou e, se a origem for um
      // CONDICAO, ramoOrigem bate com o ramoAtivo que ela calculou). Isso é
      // OU, não E — um step que reconverge dois ramos de uma condição roda
      // se qualquer um dos dois foi tomado. Caso nenhuma esteja ativa, o
      // step (e em cascata tudo que só é alcançável a partir dele) fica
      // PULADO em vez de rodar.
      const ehRaiz = step.id === raizId;
      const ativo =
        ehRaiz ||
        (conexoesPorDestino.get(step.id) ?? []).some((conexao) => {
          if (!executadosSet.has(conexao.stepOrigemId)) {
            return false;
          }
          if (conexao.ramoOrigem == null) {
            return true;
          }
          return (
            ramoAtivoPorStepId.get(conexao.stepOrigemId) === conexao.ramoOrigem
          );
        });

      if (!ativo) {
        stepsExecutados.push(
          manager.create(IntegracaoExecucaoStep, {
            stepId: step.id,
            stepApelido: step.apelido,
            tipo: step.tipo,
            status: StatusExecucao.PULADO,
            entrada: null,
            saida: null,
            erro: null,
          }),
        );
        continue;
      }

      const executor = STEP_EXECUTORS[step.tipo];
      const entradas = resolverConfigStep(
        step.config,
        saidasPorApelido,
        { ...card.campos, ...camposExtras },
        CHAVES_SEM_INTERPOLACAO_POR_STEP[step.tipo],
        CHAVES_PROFUNDAS_POR_STEP[step.tipo],
      );

      if (!executor.ehGatilho) {
        if (!step.usuarioServicoId) {
          throw new ForbiddenException(
            `Step "${step.apelido}" não tem conta de serviço configurada`,
          );
        }
        // Steps com permissaoNoExecutor fazem a própria checagem dentro de
        // `executar` (ver step-executors.ts), depois de resolver qual
        // processoId é o relevante em tempo de execução — o motor não sabe
        // isso de antemão pra esses tipos.
        if (!executor.permissaoNoExecutor) {
          const permitido = await this.verificarPermissaoServico(
            step.usuarioServicoId,
            executor.aliasPermissao!,
            integracao.processoId,
          );
          if (!permitido) {
            throw new ForbiddenException(
              `Conta de serviço do step "${step.apelido}" sem permissão: ${executor.aliasPermissao}`,
            );
          }
        }
      }

      try {
        const saida = await executor.executar({
          manager,
          card,
          step,
          entradas,
          ator,
          automacoesService,
          integracoesService: this,
          emailService: this.emailService,
          storageService: this.storageService,
          cardPdfEmissaoService: this.cardPdfEmissaoService,
          cardsCriados,
          cardsAtualizados,
          emailsEnfileirados,
          notificacoesEnfileiradas,
          profundidade,
        });
        saidasPorApelido.set(step.apelido, saida);
        executadosSet.add(step.id);
        if (step.tipo === StepTipo.CONDICAO) {
          ramoAtivoPorStepId.set(
            step.id,
            (saida as { ramoAtivo: string }).ramoAtivo,
          );
        }
        stepsExecutados.push(
          manager.create(IntegracaoExecucaoStep, {
            stepId: step.id,
            stepApelido: step.apelido,
            tipo: step.tipo,
            status: StatusExecucao.SUCESSO,
            entrada: entradas,
            saida,
            erro: null,
          }),
        );

        if (step.tipo === StepTipo.REPETICAO) {
          const { quantidade, delayMs } = saida as {
            quantidade: number;
            delayMs: number;
          };
          const corpoEnquanto = this.calcularCorpoRepeticao(
            integracao,
            step.id,
            RAMO_REPETICAO_ENQUANTO,
          );
          const corpoEnquantoOrdem = this.ordenarTopologicamente(
            integracao,
            corpoEnquanto,
          );

          for (let indice = 0; indice < quantidade; indice++) {
            // Cópias por iteração: steps do corpo precisam poder "rodar de
            // novo" a cada volta (executadosSet/saidasPorApelido fresh),
            // mas ainda enxergando o que já rodou fora do corpo (por isso
            // partem de uma cópia do estado externo, não de um Set vazio).
            // ramoAtivoPorStepId marca ESTE REPETICAO como "ENQUANTO" só
            // nessa cópia — é o que ativa as conexões desse ramo saindo
            // dele, exatamente como um ramo de CONDICAO seria ativado.
            const ramoAtivoIteracao = new Map(ramoAtivoPorStepId);
            ramoAtivoIteracao.set(step.id, RAMO_REPETICAO_ENQUANTO);
            await this.executarSequencia({
              manager,
              integracao,
              ordem: corpoEnquantoOrdem,
              raizId: step.id,
              conexoesPorDestino,
              executadosSet: new Set(executadosSet),
              ramoAtivoPorStepId: ramoAtivoIteracao,
              saidasPorApelido: new Map(saidasPorApelido),
              stepsExecutados,
              card,
              ator,
              automacoesService,
              cardsCriados,
              profundidade,
              cardsAtualizados,
              emailsEnfileirados,
              notificacoesEnfileiradas,
              camposExtras: { ...camposExtras, repeticaoIndice: indice },
            });

            // Nunca espera depois da última volta — o FINALIZADO deve
            // seguir na hora. `validarConfig` já garante que
            // (quantidade - 1) * delayMs fica dentro de
            // MAX_ATRASO_TOTAL_MS_REPETICAO, então não precisa reconferir
            // aqui em runtime (delayMs é sempre literal, nunca $stepRef).
            if (indice < quantidade - 1 && delayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
          }

          // Terminadas todas as voltas, marca ESTE REPETICAO como
          // "FINALIZADO" no escopo de fora (não numa cópia) — os steps
          // ligados a esse ramo continuam a sequência normal do loop
          // externo, ativados uma única vez, como se fossem um ramo comum
          // de CONDICAO.
          ramoAtivoPorStepId.set(step.id, RAMO_REPETICAO_FINALIZADO);
        }
      } catch (erroStep) {
        stepsExecutados.push(
          manager.create(IntegracaoExecucaoStep, {
            stepId: step.id,
            stepApelido: step.apelido,
            tipo: step.tipo,
            status: StatusExecucao.ERRO,
            entrada: entradas,
            saida: null,
            erro: { mensagem: (erroStep as Error).message },
          }),
        );
        throw erroStep;
      }
    }
  }

  private async registrarExecucaoErroForaDaTransacao(
    integracao: Integracao,
    card: Card,
    gatilhoTipo: StepTipo,
    steps: IntegracaoExecucaoStep[],
    detalhe: Record<string, unknown>,
  ): Promise<void> {
    await this.dataSource.transaction(async (managerIndependente) => {
      await managerIndependente.save(
        managerIndependente.create(IntegracaoExecucao, {
          integracaoId: integracao.id,
          cardId: card.id,
          gatilhoTipo,
          status: StatusExecucao.ERRO,
          detalhe,
          steps,
        }),
      );
    });
  }

  private calcularAlcancaveis(
    integracao: Integracao,
    raizId: string,
  ): Set<string> {
    const adjacencia = new Map<string, string[]>();
    for (const conexao of integracao.conexoes) {
      const lista = adjacencia.get(conexao.stepOrigemId) ?? [];
      lista.push(conexao.stepDestinoId);
      adjacencia.set(conexao.stepOrigemId, lista);
    }
    const visitados = new Set<string>([raizId]);
    const fila = [raizId];
    while (fila.length > 0) {
      const atual = fila.shift()!;
      for (const vizinho of adjacencia.get(atual) ?? []) {
        if (!visitados.has(vizinho)) {
          visitados.add(vizinho);
          fila.push(vizinho);
        }
      }
    }
    return visitados;
  }

  // Equivalente id-based de calcularCorpoRepeticaoPorApelido — usado em
  // tempo de execução (executarSequencia), onde já se trabalha com
  // IntegracaoStep/IntegracaoConexao de verdade, não os DTOs de criação.
  private calcularCorpoRepeticao(
    integracao: Integracao,
    stepId: string,
    ramo: string,
  ): Set<string> {
    const adjacencia = new Map<string, string[]>();
    for (const conexao of integracao.conexoes) {
      const lista = adjacencia.get(conexao.stepOrigemId) ?? [];
      lista.push(conexao.stepDestinoId);
      adjacencia.set(conexao.stepOrigemId, lista);
    }
    const destinosDiretos = integracao.conexoes
      .filter((c) => c.stepOrigemId === stepId && c.ramoOrigem === ramo)
      .map((c) => c.stepDestinoId);
    const visitados = new Set<string>(destinosDiretos);
    const fila = [...destinosDiretos];
    while (fila.length > 0) {
      const atual = fila.shift()!;
      for (const vizinho of adjacencia.get(atual) ?? []) {
        if (!visitados.has(vizinho)) {
          visitados.add(vizinho);
          fila.push(vizinho);
        }
      }
    }
    return visitados;
  }

  private ordenarTopologicamente(
    integracao: Integracao,
    alcancaveis: Set<string>,
  ): IntegracaoStep[] {
    const stepsPorId = new Map(integracao.steps.map((s) => [s.id, s]));
    const subset = [...alcancaveis];
    const grauEntrada = new Map<string, number>(subset.map((id) => [id, 0]));
    const adjacencia = new Map<string, string[]>(subset.map((id) => [id, []]));
    for (const conexao of integracao.conexoes) {
      if (
        alcancaveis.has(conexao.stepOrigemId) &&
        alcancaveis.has(conexao.stepDestinoId)
      ) {
        adjacencia.get(conexao.stepOrigemId)!.push(conexao.stepDestinoId);
        grauEntrada.set(
          conexao.stepDestinoId,
          (grauEntrada.get(conexao.stepDestinoId) ?? 0) + 1,
        );
      }
    }
    const fila = subset.filter((id) => grauEntrada.get(id) === 0);
    const resultado: IntegracaoStep[] = [];
    while (fila.length > 0) {
      const atual = fila.shift()!;
      resultado.push(stepsPorId.get(atual)!);
      for (const vizinho of adjacencia.get(atual) ?? []) {
        grauEntrada.set(vizinho, grauEntrada.get(vizinho)! - 1);
        if (grauEntrada.get(vizinho) === 0) {
          fila.push(vizinho);
        }
      }
    }
    // Ciclo já é impossível aqui — validado em validarGrafo na criação/
    // atualização da integração.
    return resultado;
  }
}
