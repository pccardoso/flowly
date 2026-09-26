import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UsersService } from '../../users/users.service';

// Guard global (ver AuthModule): toda rota exige `Authorization: Bearer
// <token>` válido por padrão, exceto as marcadas com @Public().
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extrairToken(req);
    if (!token) {
      throw new UnauthorizedException('Token não informado');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    // Reconfirma o status no banco a cada request — o token fica válido por
    // até JWT_EXPIRES_IN (default 8h), então não dá pra confiar só no que
    // foi assinado no login: um usuário bloqueado no meio da sessão precisa
    // perder acesso imediatamente, não só na próxima vez que tentar logar.
    const usuario = await this.usersService.buscarEntidadePorId(payload.sub);
    if (!usuario || usuario.bloqueado) {
      throw new UnauthorizedException('Usuário bloqueado');
    }

    (req as Request & { user: JwtPayload }).user = payload;
    return true;
  }

  private extrairToken(req: Request): string | undefined {
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    return tipo === 'Bearer' ? token : undefined;
  }
}
