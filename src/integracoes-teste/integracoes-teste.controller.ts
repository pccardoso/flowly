import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IntegracaoTesteService } from './integracoes-teste.service';
import { TestarStepDto } from './dto/testar-step.dto';
import { PermissoesGuard } from '../permissoes/guards/permissoes.guard';
import { RequerPermissao } from '../permissoes/decorators/requer-permissao.decorator';
import { porParametro } from '../permissoes/decorators/resolvedores';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

// Ver PLANO_TESTE_INTERATIVO_INTEGRACOES.md — testa UM step de cada vez,
// contra um card real, sem esperar nenhum evento de produção acontecer.
// Mesma permissão exigida pra editar a integração (quem pode mexer no grafo
// pode testá-lo, já que os steps rodam de verdade).
@Controller('processos/:processoId/integracoes/:integracaoId/testar/steps')
@UseGuards(PermissoesGuard)
export class IntegracaoTesteController {
  constructor(
    private readonly integracaoTesteService: IntegracaoTesteService,
  ) {}

  @Post(':stepApelido')
  @RequerPermissao('integracao.editar', porParametro('processoId'))
  testarStep(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('integracaoId', ParseUUIDPipe) integracaoId: string,
    @Param('stepApelido') stepApelido: string,
    @Body() dto: TestarStepDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.integracaoTesteService.testarStep(
      processoId,
      integracaoId,
      stepApelido,
      dto,
      { usuarioId: usuario.sub, automatico: false },
    );
  }
}
