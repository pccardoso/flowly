import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { DataSource, QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AtualizarMeuPerfilDto } from './dto/atualizar-meu-perfil.dto';
import { StorageService } from '../storage/storage.service';

const UNIQUE_VIOLATION = '23505';
const SALT_ROUNDS = 10;

export interface UsuarioResposta {
  id: string;
  nome: string;
  email: string;
  isSuperAdmin: boolean;
  bloqueado: boolean;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface AvatarParaUpload {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

export interface AvatarDownload {
  mimeType: string;
  stream: Readable;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
  ) {}

  // Nunca expõe senhaHash — nem em listagem, nem em detalhe.
  private paraResposta(usuario: User): UsuarioResposta {
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      isSuperAdmin: usuario.isSuperAdmin,
      bloqueado: usuario.bloqueado,
      avatarUrl: usuario.avatarObjectKey
        ? `/usuarios/${usuario.id}/avatar`
        : null,
      createdAt: usuario.createdAt,
    };
  }

  private async salvarComEmailUnico(usuario: User): Promise<User> {
    try {
      return await this.dataSource.manager.save(usuario);
    } catch (error) {
      const driverCode = (error as { driverError?: { code?: string } })
        .driverError?.code;
      if (
        error instanceof QueryFailedError &&
        driverCode === UNIQUE_VIOLATION
      ) {
        throw new ConflictException('Já existe um usuário com esse email');
      }
      throw error;
    }
  }

  async criar(dto: CreateUserDto): Promise<UsuarioResposta> {
    const senhaHash = await bcrypt.hash(dto.senha, SALT_ROUNDS);
    const usuario = this.dataSource.manager.create(User, {
      nome: dto.nome,
      email: dto.email.toLowerCase(),
      senhaHash,
    });
    const salvo = await this.salvarComEmailUnico(usuario);
    return this.paraResposta(salvo);
  }

  private async buscarEntidadeOuFalhar(id: string): Promise<User> {
    const usuario = await this.dataSource.manager.findOne(User, {
      where: { id },
    });
    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return usuario;
  }

  async buscarPorId(id: string): Promise<UsuarioResposta> {
    return this.paraResposta(await this.buscarEntidadeOuFalhar(id));
  }

  // Igual buscarPorId, mas retorna a entidade crua (com `bloqueado`) — usado
  // pelo JwtAuthGuard, que precisa reconfirmar o status a cada request (não
  // dá pra confiar só no que foi assinado no token no momento do login,
  // senão um usuário bloqueado no meio da sessão continuaria com acesso até
  // o token expirar).
  async buscarEntidadePorId(id: string): Promise<User | null> {
    return this.dataSource.manager.findOne(User, { where: { id } });
  }

  async atualizar(id: string, dto: UpdateUserDto): Promise<UsuarioResposta> {
    const usuario = await this.buscarEntidadeOuFalhar(id);
    if (dto.nome !== undefined) {
      usuario.nome = dto.nome;
    }
    if (dto.email !== undefined) {
      usuario.email = dto.email.toLowerCase();
    }
    if (dto.senha !== undefined) {
      usuario.senhaHash = await bcrypt.hash(dto.senha, SALT_ROUNDS);
    }
    const salvo = await this.salvarComEmailUnico(usuario);
    return this.paraResposta(salvo);
  }

  // Autoedição (PATCH /usuarios/me) — só nome/senha, nunca email/
  // isSuperAdmin/bloqueado (ver AtualizarMeuPerfilDto). Diferente de
  // atualizar() (admin, PATCH /usuarios/:id): aqui a troca de senha exige a
  // senha atual, porque quem chama não tem usuario.editar — só está confiando
  // no próprio JWT, que uma sessão esquecida aberta também teria.
  async atualizarMeuPerfil(
    usuarioId: string,
    dto: AtualizarMeuPerfilDto,
  ): Promise<UsuarioResposta> {
    const usuario = await this.dataSource.manager.findOne(User, {
      where: { id: usuarioId },
      select: {
        id: true,
        nome: true,
        email: true,
        senhaHash: true,
        isSuperAdmin: true,
        bloqueado: true,
        avatarObjectKey: true,
        avatarMimeType: true,
        createdAt: true,
      },
    });
    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (dto.nome !== undefined) {
      usuario.nome = dto.nome;
    }
    if (dto.novaSenha !== undefined) {
      const senhaAtualCorreta = await bcrypt.compare(
        dto.senhaAtual!,
        usuario.senhaHash,
      );
      if (!senhaAtualCorreta) {
        throw new UnauthorizedException('Senha atual incorreta');
      }
      usuario.senhaHash = await bcrypt.hash(dto.novaSenha, SALT_ROUNDS);
    }

    const salvo = await this.dataSource.manager.save(usuario);
    return this.paraResposta(salvo);
  }

  async enviarAvatar(
    usuarioId: string,
    arquivo: AvatarParaUpload,
  ): Promise<UsuarioResposta> {
    const usuario = await this.buscarEntidadeOuFalhar(usuarioId);

    const objectKeyAnterior = usuario.avatarObjectKey;
    const objectKey = `usuarios/${usuarioId}/${randomUUID()}-${arquivo.originalname}`;
    await this.storageService.salvar(
      objectKey,
      arquivo.buffer,
      arquivo.mimetype,
    );

    usuario.avatarObjectKey = objectKey;
    usuario.avatarMimeType = arquivo.mimetype;

    try {
      const salvo = await this.dataSource.manager.save(usuario);
      // Só apaga o avatar antigo depois que o novo já está persistido.
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

  async obterAvatar(usuarioId: string): Promise<AvatarDownload> {
    const usuario = await this.buscarEntidadeOuFalhar(usuarioId);
    if (!usuario.avatarObjectKey) {
      throw new NotFoundException('Usuário não possui avatar');
    }
    const stream = await this.storageService.obterStream(
      usuario.avatarObjectKey,
    );
    return {
      mimeType: usuario.avatarMimeType ?? 'application/octet-stream',
      stream,
    };
  }

  // Única forma de "remover" um usuário — não existe hard delete (ver
  // comentário em User.bloqueado). `idSolicitante` é quem está fazendo a
  // chamada (do JWT) — nunca deixa alguém bloquear a própria conta, senão
  // ela perderia acesso no meio do próprio request (JwtAuthGuard já checa
  // bloqueado a cada request).
  async bloquear(id: string, idSolicitante: string): Promise<UsuarioResposta> {
    if (id === idSolicitante) {
      throw new UnprocessableEntityException(
        'Você não pode bloquear a própria conta',
      );
    }
    const usuario = await this.buscarEntidadeOuFalhar(id);
    usuario.bloqueado = true;
    await this.dataSource.manager.save(usuario);
    return this.paraResposta(usuario);
  }

  async desbloquear(id: string): Promise<UsuarioResposta> {
    const usuario = await this.buscarEntidadeOuFalhar(id);
    usuario.bloqueado = false;
    await this.dataSource.manager.save(usuario);
    return this.paraResposta(usuario);
  }

  // Diretório de baixo risco (sem senha/hash exposto), usado pra montar
  // grupos e escolher conta de serviço de Integração — nunca lista usuário
  // bloqueado, pra ele não poder ser adicionado a nada novo (o vínculo que
  // ele já tinha antes de ser bloqueado continua existindo, só que sem
  // efeito nenhum: ver PermissoesService.usuarioTemPermissao).
  async listar(): Promise<UsuarioResposta[]> {
    const usuarios = await this.dataSource.manager.find(User, {
      where: { bloqueado: false },
      order: { createdAt: 'ASC' },
    });
    return usuarios.map((usuario) => this.paraResposta(usuario));
  }

  // Listagem completa (inclui bloqueados) pra tela de gerenciamento de
  // usuários — diferente de listar() de propósito.
  async listarParaGerenciamento(): Promise<UsuarioResposta[]> {
    const usuarios = await this.dataSource.manager.find(User, {
      order: { createdAt: 'ASC' },
    });
    return usuarios.map((usuario) => this.paraResposta(usuario));
  }

  // Único ponto que precisa de senhaHash (comparação de senha no login) —
  // select:false na coluna exige pedir explicitamente aqui.
  async buscarPorEmail(email: string): Promise<User | null> {
    return this.dataSource.manager.findOne(User, {
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        nome: true,
        email: true,
        senhaHash: true,
        isSuperAdmin: true,
        bloqueado: true,
        avatarObjectKey: true,
        createdAt: true,
      },
    });
  }
}
