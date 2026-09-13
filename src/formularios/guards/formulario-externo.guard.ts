import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { Processo } from '../../processos/entities/processo.entity';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

// Guarda as rotas de FormulariosController, que são sempre marcadas
// @Public() (ficam fora do JwtAuthGuard global) e decidem sozinhas se
// exigem token, consultando Processo.formularioExternoRequerAutenticacao —
// por isso não dá pra resolver isso com metadata estática de rota (@Public/
// @RequerPermissao), a decisão depende de dado em banco por processo.
//
// Deliberadamente não passa pelo PermissoesGuard/catálogo de grupos: quando
// exige autenticação, basta um JWT válido de qualquer usuário (não precisa
// ter card.criar em nenhum grupo) — é um formulário de captação externa, não
// uma rota interna do kanban.
@Injectable()
export class FormularioExternoGuard implements CanActivate {
  constructor(
    @InjectRepository(Processo)
    private readonly processoRepository: Repository<Processo>,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const processoId = req.params.processoId as string;

    const processo = await this.processoRepository.findOne({
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    const token = this.extrairToken(req);
    if (!token) {
      if (processo.formularioExternoRequerAutenticacao) {
        throw new UnauthorizedException(
          'Este formulário exige autenticação — informe um token válido',
        );
      }
      return true;
    }

    // Tenta identificar o usuário mesmo quando o formulário não exige
    // autenticação — se alguém logado preencher um formulário público, o
    // histórico do card criado registra quem foi, em vez de ficar anônimo à
    // toa. Só derruba a requisição com token inválido quando autenticação é
    // realmente obrigatória; senão, ignora e segue como anônimo.
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      (req as Request & { user: JwtPayload }).user = payload;
    } catch {
      if (processo.formularioExternoRequerAutenticacao) {
        throw new UnauthorizedException('Token inválido ou expirado');
      }
    }
    return true;
  }

  private extrairToken(req: Request): string | undefined {
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    return tipo === 'Bearer' ? token : undefined;
  }
}
