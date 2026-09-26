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
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RelatoriosService } from './relatorios.service';
import { CreateRelatorioModeloDto } from './dto/create-relatorio-modelo.dto';
import { UpdateRelatorioModeloDto } from './dto/update-relatorio-modelo.dto';
import { PreVisualizarRelatorioDto } from './dto/pre-visualizar-relatorio.dto';
import { PaginacaoRelatorioQueryDto } from './dto/paginacao-relatorio-query.dto';
import { ExportarRelatorioQueryDto } from './dto/exportar-relatorio-query.dto';
import { PermissoesGuard } from '../permissoes/guards/permissoes.guard';
import { RequerPermissao } from '../permissoes/decorators/requer-permissao.decorator';
import { porParametro } from '../permissoes/decorators/resolvedores';

@Controller('processos/:processoId/relatorios')
@UseGuards(PermissoesGuard)
export class RelatoriosController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  @Get('campos-disponiveis')
  @RequerPermissao('relatorio.visualizar', porParametro('processoId'))
  camposDisponiveis(@Param('processoId', ParseUUIDPipe) processoId: string) {
    return this.relatoriosService.catalogoCampos(processoId);
  }

  // Roda a especificação (colunas/filtros) direto, sem exigir um modelo já
  // salvo — o front chama isso enquanto o usuário ainda está montando o
  // relatório na tela.
  @Post('pre-visualizar')
  @RequerPermissao('relatorio.visualizar', porParametro('processoId'))
  preVisualizar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Body() dto: PreVisualizarRelatorioDto,
  ) {
    return this.relatoriosService.executarConsulta(
      processoId,
      dto.colunas,
      dto.filtros ?? [],
      dto.page ?? 1,
      dto.perPage ?? 20,
    );
  }

  @Get('modelos')
  @RequerPermissao('relatorio.visualizar', porParametro('processoId'))
  listarModelos(@Param('processoId', ParseUUIDPipe) processoId: string) {
    return this.relatoriosService.listarModelos(processoId);
  }

  @Post('modelos')
  @RequerPermissao('relatorio.criar', porParametro('processoId'))
  criarModelo(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Body() dto: CreateRelatorioModeloDto,
  ) {
    return this.relatoriosService.criarModelo(processoId, dto);
  }

  @Get('modelos/:modeloId')
  @RequerPermissao('relatorio.visualizar', porParametro('processoId'))
  buscarModelo(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('modeloId', ParseUUIDPipe) modeloId: string,
  ) {
    return this.relatoriosService.buscarModelo(processoId, modeloId);
  }

  @Patch('modelos/:modeloId')
  @RequerPermissao('relatorio.editar', porParametro('processoId'))
  atualizarModelo(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('modeloId', ParseUUIDPipe) modeloId: string,
    @Body() dto: UpdateRelatorioModeloDto,
  ) {
    return this.relatoriosService.atualizarModelo(processoId, modeloId, dto);
  }

  @Delete('modelos/:modeloId')
  @RequerPermissao('relatorio.remover', porParametro('processoId'))
  @HttpCode(204)
  removerModelo(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('modeloId', ParseUUIDPipe) modeloId: string,
  ) {
    return this.relatoriosService.removerModelo(processoId, modeloId);
  }

  @Get('modelos/:modeloId/dados')
  @RequerPermissao('relatorio.visualizar', porParametro('processoId'))
  dadosModelo(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('modeloId', ParseUUIDPipe) modeloId: string,
    @Query() query: PaginacaoRelatorioQueryDto,
  ) {
    return this.relatoriosService.executarModeloSalvo(
      processoId,
      modeloId,
      query.page,
      query.perPage,
    );
  }

  @Get('modelos/:modeloId/exportar')
  @RequerPermissao('relatorio.emitir', porParametro('processoId'))
  async exportarModelo(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('modeloId', ParseUUIDPipe) modeloId: string,
    @Query() query: ExportarRelatorioQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { conteudo, mimeType, nomeArquivo } =
      await this.relatoriosService.exportarModeloSalvo(
        processoId,
        modeloId,
        query.formato,
      );
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
      'Content-Length': conteudo.length,
    });
    return new StreamableFile(conteudo);
  }
}
