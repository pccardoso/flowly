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
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { PdfModelosService } from './pdf-modelos.service';
import { CreatePdfModeloDto } from './dto/create-pdf-modelo.dto';
import { UpdatePdfModeloDto } from './dto/update-pdf-modelo.dto';
import { PreVisualizarPdfModeloDto } from './dto/pre-visualizar-pdf-modelo.dto';
import { PermissoesGuard } from '../permissoes/guards/permissoes.guard';
import { RequerPermissao } from '../permissoes/decorators/requer-permissao.decorator';
import { porParametro } from '../permissoes/decorators/resolvedores';

@Controller('processos/:processoId/pdf-modelos')
@UseGuards(PermissoesGuard)
export class PdfModelosController {
  constructor(private readonly pdfModelosService: PdfModelosService) {}

  @Get('campos-disponiveis')
  @RequerPermissao('pdfModelo.visualizar', porParametro('processoId'))
  camposDisponiveis(@Param('processoId', ParseUUIDPipe) processoId: string) {
    return this.pdfModelosService.catalogoCampos(processoId);
  }

  @Get()
  @RequerPermissao('pdfModelo.visualizar', porParametro('processoId'))
  listar(@Param('processoId', ParseUUIDPipe) processoId: string) {
    return this.pdfModelosService.listar(processoId);
  }

  @Post()
  @RequerPermissao('pdfModelo.criar', porParametro('processoId'))
  criar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Body() dto: CreatePdfModeloDto,
  ) {
    return this.pdfModelosService.criar(processoId, dto);
  }

  @Get(':modeloId')
  @RequerPermissao('pdfModelo.visualizar', porParametro('processoId'))
  buscar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('modeloId', ParseUUIDPipe) modeloId: string,
  ) {
    return this.pdfModelosService.buscar(processoId, modeloId);
  }

  @Patch(':modeloId')
  @RequerPermissao('pdfModelo.editar', porParametro('processoId'))
  atualizar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('modeloId', ParseUUIDPipe) modeloId: string,
    @Body() dto: UpdatePdfModeloDto,
  ) {
    return this.pdfModelosService.atualizar(processoId, modeloId, dto);
  }

  @Delete(':modeloId')
  @RequerPermissao('pdfModelo.remover', porParametro('processoId'))
  @HttpCode(204)
  remover(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('modeloId', ParseUUIDPipe) modeloId: string,
  ) {
    return this.pdfModelosService.remover(processoId, modeloId);
  }

  @Post(':modeloId/pre-visualizar')
  @RequerPermissao('pdfModelo.visualizar', porParametro('processoId'))
  async preVisualizar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('modeloId', ParseUUIDPipe) modeloId: string,
    @Body() dto: PreVisualizarPdfModeloDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.pdfModelosService.preVisualizar(
      processoId,
      modeloId,
      dto.cardId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': buffer.length,
    });
    return new StreamableFile(buffer);
  }
}
