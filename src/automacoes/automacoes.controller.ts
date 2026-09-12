import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AutomacoesService } from './automacoes.service';
import { CreateAutomacaoDto } from './dto/create-automacao.dto';
import { UpdateAutomacaoDto } from './dto/update-automacao.dto';
import { PermissoesGuard } from '../permissoes/guards/permissoes.guard';
import { RequerPermissao } from '../permissoes/decorators/requer-permissao.decorator';
import { porParametro } from '../permissoes/decorators/resolvedores';

@Controller('processos/:processoId/automacoes')
@UseGuards(PermissoesGuard)
export class AutomacoesController {
  constructor(private readonly automacoesService: AutomacoesService) {}

  @Get()
  @RequerPermissao('automacao.visualizar', porParametro('processoId'))
  listar(@Param('processoId', ParseUUIDPipe) processoId: string) {
    return this.automacoesService.listarPorProcesso(processoId);
  }

  @Post()
  @RequerPermissao('automacao.criar', porParametro('processoId'))
  criar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Body() dto: CreateAutomacaoDto,
  ) {
    return this.automacoesService.criar(processoId, dto);
  }

  @Patch(':automacaoId')
  @RequerPermissao('automacao.editar', porParametro('processoId'))
  atualizar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('automacaoId', ParseUUIDPipe) automacaoId: string,
    @Body() dto: UpdateAutomacaoDto,
  ) {
    return this.automacoesService.atualizar(processoId, automacaoId, dto);
  }

  @Delete(':automacaoId')
  @RequerPermissao('automacao.remover', porParametro('processoId'))
  @HttpCode(204)
  remover(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('automacaoId', ParseUUIDPipe) automacaoId: string,
  ) {
    return this.automacoesService.remover(processoId, automacaoId);
  }
}
