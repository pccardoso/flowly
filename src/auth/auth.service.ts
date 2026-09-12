import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

export interface LoginResposta {
  accessToken: string;
  usuario: {
    id: string;
    nome: string;
    email: string;
    isSuperAdmin: boolean;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResposta> {
    const usuario = await this.usersService.buscarPorEmail(dto.email);
    // Mesma mensagem pra email inexistente e senha errada — não vaza se o
    // email está cadastrado.
    if (!usuario || !(await bcrypt.compare(dto.senha, usuario.senhaHash))) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      isSuperAdmin: usuario.isSuperAdmin,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        isSuperAdmin: usuario.isSuperAdmin,
      },
    };
  }
}
