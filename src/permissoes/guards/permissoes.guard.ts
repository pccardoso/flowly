import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import type { Request } from 'express';
import { PermissoesService } from '../permissoes.service';
import {
  MetaRequerPermissao,
  REQUER_PERMISSAO_KEY,
} from '../decorators/requer-permissao.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

// Só age em rotas marcadas com @RequerPermissao — sem a marca, deixa passar
// (a rota já está protegida por exigir login, via JwtAuthGuard global).
// isSuperAdmin (ver User) ignora toda checagem, é o bypass de bootstrap.
@Injectable()
export class PermissoesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissoesService: PermissoesService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<
      MetaRequerPermissao | undefined
    >(REQUER_PERMISSAO_KEY, [context.getHandler(), context.getClass()]);
    if (!meta) {
      return true;
    }

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const usuario = req.user;
    if (!usuario) {
      throw new UnauthorizedException();
    }
    if (usuario.isSuperAdmin) {
      return true;
    }

    const processoId = meta.resolvedorProcessoId
      ? await meta.resolvedorProcessoId(req, this.dataSource)
      : undefined;

    const permitido = await this.permissoesService.usuarioTemPermissao(
      usuario.sub,
      meta.alias,
      processoId,
    );
    if (!permitido) {
      throw new ForbiddenException(`Sem permissão: ${meta.alias}`);
    }
    return true;
  }
}
