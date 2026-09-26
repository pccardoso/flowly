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
import { EtiquetasService } from './etiquetas.service';
import { CreateEtiquetaDto } from './dto/create-etiqueta.dto';
import { UpdateEtiquetaDto } from './dto/update-etiqueta.dto';
import { PermissoesGuard } from '../permissoes/guards/permissoes.guard';
import { RequerPermissao } from '../permissoes/decorators/requer-permissao.decorator';
import { porParametro } from '../permissoes/decorators/resolvedores';

@Controller('processos/:processoId/etiquetas')
@UseGuards(PermissoesGuard)
export class EtiquetasController {
  constructor(private readonly etiquetasService: EtiquetasService) {}

  @Get()
  @RequerPermissao('etiqueta.visualizar', porParametro('processoId'))
  listar(@Param('processoId', ParseUUIDPipe) processoId: string) {
    return this.etiquetasService.listar(processoId);
  }

  @Post()
  @RequerPermissao('etiqueta.criar', porParametro('processoId'))
  criar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Body() dto: CreateEtiquetaDto,
  ) {
    return this.etiquetasService.criar(processoId, dto);
  }

  @Get(':etiquetaId')
  @RequerPermissao('etiqueta.visualizar', porParametro('processoId'))
  buscar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('etiquetaId', ParseUUIDPipe) etiquetaId: string,
  ) {
    return this.etiquetasService.buscar(processoId, etiquetaId);
  }

  @Patch(':etiquetaId')
  @RequerPermissao('etiqueta.editar', porParametro('processoId'))
  atualizar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('etiquetaId', ParseUUIDPipe) etiquetaId: string,
    @Body() dto: UpdateEtiquetaDto,
  ) {
    return this.etiquetasService.atualizar(processoId, etiquetaId, dto);
  }

  @Delete(':etiquetaId')
  @RequerPermissao('etiqueta.remover', porParametro('processoId'))
  @HttpCode(204)
  remover(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('etiquetaId', ParseUUIDPipe) etiquetaId: string,
  ) {
    return this.etiquetasService.remover(processoId, etiquetaId);
  }
}
