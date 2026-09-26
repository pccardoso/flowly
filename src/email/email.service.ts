import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { createTransport } from 'nodemailer';
import { Readable } from 'stream';
import { EntityManager, Repository } from 'typeorm';
import { cifrar, decifrar } from '../common/crypto.util';
import { StorageService } from '../storage/storage.service';
import { ProvedorEmail } from './entities/provedor-email.entity';
import { AnexoEmailEnvio, EmailEnvio } from './entities/email-envio.entity';
import { CreateProvedorEmailDto } from './dto/create-provedor-email.dto';
import { UpdateProvedorEmailDto } from './dto/update-provedor-email.dto';
import { TipoProvedorEmail } from './enums/tipo-provedor-email.enum';
import { StatusEmailEnvio } from './enums/status-email-envio.enum';
import { PRESETS_PROVEDOR_EMAIL } from './email-provider-presets';

// Nunca expõe senhaCifrada — nem em listagem, nem em detalhe, nem no
// retorno de criar/atualizar. `select: false` na coluna já garante isso pra
// find()/findOne() (não vem nem carregado), mas criarProvedor/
// atualizarProvedor retornam a entity que ACABOU de ser salva em memória —
// aí a senha cifrada está presente no objeto independente do `select:
// false` (que só afeta o que uma query traz do banco, não um objeto que já
// existia em memória) — por isso todo retorno passa por aqui, mesmo padrão
// de UsersService.paraResposta com User.senhaHash.
export type ProvedorEmailResposta = Omit<ProvedorEmail, 'senhaCifrada'>;

export interface EnfileirarEnvioParams {
  provedorId: string;
  destinatarios: string[];
  cc: string[];
  assunto: string;
  corpoHtml: string;
  anexos: AnexoEmailEnvio[];
  cardId: string;
  integracaoId: string | null;
  stepApelido: string;
}

export const FILA_EMAIL_ENVIO = 'email-envio';
const MAXIMO_TENTATIVAS = 3;

@Injectable()
export class EmailService {
  constructor(
    @InjectRepository(ProvedorEmail)
    private readonly provedorRepository: Repository<ProvedorEmail>,
    @InjectRepository(EmailEnvio)
    private readonly envioRepository: Repository<EmailEnvio>,
    private readonly storageService: StorageService,
    @InjectQueue(FILA_EMAIL_ENVIO)
    private readonly filaEmail: Queue<{ envioId: string }>,
  ) {}

  private paraResposta(provedor: ProvedorEmail): ProvedorEmailResposta {
    const { senhaCifrada: _senhaCifrada, ...resposta } = provedor;
    return resposta;
  }

  async listarProvedores(): Promise<ProvedorEmailResposta[]> {
    const provedores = await this.provedorRepository.find({
      order: { createdAt: 'ASC' },
    });
    return provedores.map((provedor) => this.paraResposta(provedor));
  }

  async buscarProvedor(id: string): Promise<ProvedorEmailResposta> {
    return this.paraResposta(await this.buscarEntidadeOuFalhar(id));
  }

  // Diferente de buscarProvedor: retorna a entity crua (com senhaCifrada
  // presente quando carregada), usada só internamente por
  // atualizarProvedor/removerProvedor — nunca sai direto pra um controller.
  private async buscarEntidadeOuFalhar(id: string): Promise<ProvedorEmail> {
    const provedor = await this.provedorRepository.findOne({ where: { id } });
    if (!provedor) {
      throw new NotFoundException('Provedor de email não encontrado');
    }
    return provedor;
  }

  // Usado por IntegracoesService.validarGrafo (validarConfig do step EMAIL)
  // pra checar, já na criação/edição da integração, que config.provedorId
  // aponta pra um provedor de verdade — mesmo papel de faseRepository/
  // processoConexaoRepository em DepsValidacaoStep pros outros steps.
  async provedorExiste(id: string): Promise<boolean> {
    return (await this.provedorRepository.count({ where: { id } })) > 0;
  }

  // GMAIL/OUTLOOK preenchem host/porta/seguro sozinhos a partir do preset
  // quando o usuário não informa (ver email-provider-presets.ts);
  // SMTP_CUSTOM sempre exige os três explícitos.
  private resolverHostPortaSeguro(
    tipo: TipoProvedorEmail,
    host: string | undefined,
    porta: number | undefined,
    seguro: boolean | undefined,
  ): { host: string; porta: number; seguro: boolean } {
    if (host !== undefined && porta !== undefined && seguro !== undefined) {
      return { host, porta, seguro };
    }
    const preset = PRESETS_PROVEDOR_EMAIL[tipo];
    if (!preset) {
      throw new UnprocessableEntityException(
        'host, porta e seguro são obrigatórios para tipo SMTP_CUSTOM',
      );
    }
    return {
      host: host ?? preset.host,
      porta: porta ?? preset.porta,
      seguro: seguro ?? preset.seguro,
    };
  }

  async criarProvedor(
    dto: CreateProvedorEmailDto,
  ): Promise<ProvedorEmailResposta> {
    const { host, porta, seguro } = this.resolverHostPortaSeguro(
      dto.tipo,
      dto.host,
      dto.porta,
      dto.seguro,
    );
    const provedor = this.provedorRepository.create({
      nome: dto.nome,
      tipo: dto.tipo,
      host,
      porta,
      seguro,
      usuario: dto.usuario,
      senhaCifrada: cifrar(dto.senha),
      remetenteNome: dto.remetenteNome ?? null,
      remetentePadrao: dto.remetentePadrao ?? dto.usuario,
      ativo: dto.ativo ?? true,
    });
    return this.paraResposta(await this.provedorRepository.save(provedor));
  }

  async atualizarProvedor(
    id: string,
    dto: UpdateProvedorEmailDto,
  ): Promise<ProvedorEmailResposta> {
    const provedor = await this.buscarEntidadeOuFalhar(id);

    if (
      dto.tipo !== undefined ||
      dto.host !== undefined ||
      dto.porta !== undefined ||
      dto.seguro !== undefined
    ) {
      const tipo = dto.tipo ?? provedor.tipo;
      const { host, porta, seguro } = this.resolverHostPortaSeguro(
        tipo,
        dto.host ?? provedor.host,
        dto.porta ?? provedor.porta,
        dto.seguro ?? provedor.seguro,
      );
      provedor.tipo = tipo;
      provedor.host = host;
      provedor.porta = porta;
      provedor.seguro = seguro;
    }
    if (dto.usuario !== undefined) {
      provedor.usuario = dto.usuario;
    }
    if (dto.senha !== undefined) {
      provedor.senhaCifrada = cifrar(dto.senha);
    }
    if (dto.remetenteNome !== undefined) {
      provedor.remetenteNome = dto.remetenteNome;
    }
    if (dto.remetentePadrao !== undefined) {
      provedor.remetentePadrao = dto.remetentePadrao;
    }
    if (dto.ativo !== undefined) {
      provedor.ativo = dto.ativo;
    }

    return this.paraResposta(await this.provedorRepository.save(provedor));
  }

  async removerProvedor(id: string): Promise<void> {
    const provedor = await this.buscarEntidadeOuFalhar(id);
    // Envios já disparados sobrevivem com provedorId = null (SET NULL) —
    // preserva o histórico mesmo depois do provedor removido.
    await this.provedorRepository.delete(provedor.id);
  }

  async listarEnvios(cardId?: string): Promise<EmailEnvio[]> {
    return this.envioRepository.find({
      where: cardId ? { cardId } : {},
      order: { enfileiradoEm: 'DESC' },
    });
  }

  async buscarEnvio(id: string): Promise<EmailEnvio> {
    const envio = await this.envioRepository.findOne({ where: { id } });
    if (!envio) {
      throw new NotFoundException('Envio de email não encontrado');
    }
    return envio;
  }

  // Chamado pelo executor do step EMAIL (step-executors.ts), DENTRO da
  // transação do card que disparou o step — só grava a linha PENDENTE, sem
  // tocar rede. Quem chamou empilha `envio.id` num array `emailsEnfileirados`
  // que sobe a mesma cadeia de cardsCriados/cardsAtualizados (ver CLAUDE.md)
  // até CardsService, que só chama despacharEnvios depois do commit.
  async enfileirarEnvio(
    manager: EntityManager,
    params: EnfileirarEnvioParams,
  ): Promise<EmailEnvio> {
    const provedor = await manager.findOne(ProvedorEmail, {
      where: { id: params.provedorId },
    });
    if (!provedor || !provedor.ativo) {
      throw new UnprocessableEntityException(
        'Provedor de email referenciado não existe ou está inativo',
      );
    }
    if (params.destinatarios.length === 0) {
      throw new UnprocessableEntityException(
        'O step EMAIL precisa de ao menos um destinatário',
      );
    }

    return manager.save(
      manager.create(EmailEnvio, {
        provedorId: provedor.id,
        cardId: params.cardId,
        integracaoId: params.integracaoId,
        stepApelido: params.stepApelido,
        destinatarios: params.destinatarios,
        cc: params.cc,
        assunto: params.assunto,
        corpoHtml: params.corpoHtml,
        anexos: params.anexos,
        status: StatusEmailEnvio.PENDENTE,
      }),
    );
  }

  // Chamado só depois que a transação de card já comitou (CardsService) —
  // enfileira um job por envio pendente, fora da transação e da resposta
  // HTTP, pra não travar o usuário esperando o handshake SMTP.
  async despacharEnvios(envioIds: string[]): Promise<void> {
    await Promise.all(
      envioIds.map((envioId) =>
        this.filaEmail.add(
          'enviar',
          { envioId },
          {
            attempts: MAXIMO_TENTATIVAS,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: true,
            removeOnFail: 100,
          },
        ),
      ),
    );
  }

  // Roda no worker (EmailEnvioProcessor), fora de qualquer transação de
  // card. ENVIANDO -> tenta enviar via nodemailer -> ENVIADO (com a resposta
  // do provedor) ou ERRO. Erro de configuração (provedor ausente/inativo)
  // não é relançado — não adianta o BullMQ tentar de novo; qualquer outro
  // erro é relançado pro BullMQ decidir retry conforme `attempts`/`backoff`
  // configurados em despacharEnvios.
  async processarEnvio(envioId: string): Promise<void> {
    const envio = await this.envioRepository.findOne({
      where: { id: envioId },
    });
    if (!envio || envio.status === StatusEmailEnvio.ENVIADO) {
      return;
    }

    const provedor = envio.provedorId
      ? await this.provedorRepository.findOne({
          where: { id: envio.provedorId },
          select: {
            id: true,
            tipo: true,
            host: true,
            porta: true,
            seguro: true,
            usuario: true,
            senhaCifrada: true,
            remetenteNome: true,
            remetentePadrao: true,
            ativo: true,
          },
        })
      : null;

    if (!provedor || !provedor.ativo) {
      envio.status = StatusEmailEnvio.ERRO;
      envio.tentativas += 1;
      envio.erro = {
        mensagem: 'Provedor de email não encontrado ou inativo',
      };
      await this.envioRepository.save(envio);
      return;
    }

    envio.status = StatusEmailEnvio.ENVIANDO;
    envio.tentativas += 1;
    await this.envioRepository.save(envio);

    try {
      const anexos = await Promise.all(
        envio.anexos.map(async (anexo) => ({
          filename: anexo.nome,
          contentType: anexo.mimeType,
          content: await this.streamParaBuffer(
            await this.storageService.obterStream(anexo.objectKey),
          ),
        })),
      );

      const transporter = createTransport({
        host: provedor.host,
        port: provedor.porta,
        secure: provedor.seguro,
        auth: {
          user: provedor.usuario,
          pass: decifrar(provedor.senhaCifrada),
        },
      });

      const remetente = provedor.remetenteNome
        ? `"${provedor.remetenteNome}" <${provedor.remetentePadrao}>`
        : provedor.remetentePadrao;

      const info = await transporter.sendMail({
        from: remetente,
        to: envio.destinatarios.join(', '),
        cc: envio.cc.length ? envio.cc.join(', ') : undefined,
        subject: envio.assunto,
        html: envio.corpoHtml,
        attachments: anexos,
      });

      envio.status = StatusEmailEnvio.ENVIADO;
      envio.resposta = info;
      envio.erro = null;
      envio.enviadoEm = new Date();
      await this.envioRepository.save(envio);
    } catch (erro) {
      envio.status = StatusEmailEnvio.ERRO;
      envio.erro = { mensagem: (erro as Error).message };
      await this.envioRepository.save(envio);
      throw erro;
    }
  }

  private async streamParaBuffer(stream: Readable): Promise<Buffer> {
    const partes: Buffer[] = [];
    for await (const parte of stream) {
      partes.push(Buffer.isBuffer(parte) ? parte : Buffer.from(parte));
    }
    return Buffer.concat(partes);
  }
}
