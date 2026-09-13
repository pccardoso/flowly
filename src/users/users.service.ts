import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

const UNIQUE_VIOLATION = '23505';
const SALT_ROUNDS = 10;

export interface UsuarioResposta {
  id: string;
  nome: string;
  email: string;
  isSuperAdmin: boolean;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  constructor(private readonly dataSource: DataSource) {}

  // Nunca expõe senhaHash — nem em listagem, nem em detalhe.
  private paraResposta(usuario: User): UsuarioResposta {
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      isSuperAdmin: usuario.isSuperAdmin,
      createdAt: usuario.createdAt,
    };
  }

  async criar(dto: CreateUserDto): Promise<UsuarioResposta> {
    const senhaHash = await bcrypt.hash(dto.senha, SALT_ROUNDS);
    const usuario = this.dataSource.manager.create(User, {
      nome: dto.nome,
      email: dto.email.toLowerCase(),
      senhaHash,
    });

    try {
      const salvo = await this.dataSource.manager.save(usuario);
      return this.paraResposta(salvo);
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

  async listar(): Promise<UsuarioResposta[]> {
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
        createdAt: true,
      },
    });
  }
}
