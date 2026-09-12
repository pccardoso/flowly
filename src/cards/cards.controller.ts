import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CardsService } from './cards.service';
import { CardAnexosService } from './anexos.service';
import { ComentariosService } from './comentarios.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardCamposDto } from './dto/update-card-campos.dto';
import { MoverCardDto } from './dto/mover-card.dto';
import { CreateCardFilhoDto } from './dto/create-card-filho.dto';
import { ListarCardsPaginadoQueryDto } from './dto/listar-cards-paginado-query.dto';
import { CreateComentarioDto } from './dto/create-comentario.dto';
import { RemoverComentarioDto } from './dto/remover-comentario.dto';
import { PermissoesGuard } from '../permissoes/guards/permissoes.guard';
import { RequerPermissao } from '../permissoes/decorators/requer-permissao.decorator';
import { porBody, porCard, porQuery } from '../permissoes/decorators/resolvedores';

const TAMANHO_MAXIMO_ANEXO = 25 * 1024 * 1024;

@Controller('cards')
@UseGuards(PermissoesGuard)
export class CardsController {
  constructor(
    private readonly cardsService: CardsService,
    private readonly cardAnexosService: CardAnexosService,
    private readonly comentariosService: ComentariosService,
  ) {}

  @Get()
  @RequerPermissao('card.visualizar', porQuery('processoId'))
  listarPorProcesso(@Query('processoId', ParseUUIDPipe) processoId: string) {
    return this.cardsService.listarPorProcesso(processoId);
  }

  @Get('paginado')
  @RequerPermissao('card.visualizar', porQuery('processoId'))
  listarPorProcessoPaginado(@Query() query: ListarCardsPaginadoQueryDto) {
    return this.cardsService.listarPorProcessoPaginado(
      query.processoId,
      query.page,
      query.perPage,
    );
  }

  @Post()
  @RequerPermissao('card.criar', porBody('processoId'))
  criar(@Body() dto: CreateCardDto) {
    return this.cardsService.criar(dto);
  }

  @Patch(':id/campos')
  @RequerPermissao('card.editar', porCard())
  atualizarCampos(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCardCamposDto,
  ) {
    return this.cardsService.atualizarCampos(id, dto);
  }

  @Post(':id/movimentacoes')
  @RequerPermissao('card.mover', porCard())
  mover(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoverCardDto,
  ) {
    return this.cardsService.mover(id, dto);
  }

  @Get(':id/automacoes-execucoes')
  @RequerPermissao('card.visualizar', porCard())
  listarExecucoes(@Param('id', ParseUUIDPipe) id: string) {
    return this.cardsService.listarExecucoes(id);
  }

  @Get(':id')
  @RequerPermissao('card.visualizar', porCard())
  buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    return this.cardsService.buscarPorId(id);
  }

  @Post(':id/conexoes/:conexaoId/filhos')
  @RequerPermissao('card.criar', porCard())
  criarFilho(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('conexaoId', ParseUUIDPipe) conexaoId: string,
    @Body() dto: CreateCardFilhoDto,
  ) {
    return this.cardsService.criarFilho(id, conexaoId, dto);
  }

  @Delete(':id')
  @RequerPermissao('card.remover', porCard())
  @HttpCode(204)
  remover(@Param('id', ParseUUIDPipe) id: string) {
    return this.cardsService.remover(id);
  }

  @Post(':id/anexos')
  @RequerPermissao('card.editar', porCard())
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: memoryStorage(),
      limits: { fileSize: TAMANHO_MAXIMO_ANEXO },
    }),
  )
  enviarAnexo(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() arquivo?: Express.Multer.File,
  ) {
    if (!arquivo) {
      throw new BadRequestException(
        'Arquivo é obrigatório (campo multipart "arquivo")',
      );
    }
    return this.cardAnexosService.enviar(id, arquivo);
  }

  @Get(':id/anexos')
  @RequerPermissao('card.visualizar', porCard())
  listarAnexos(@Param('id', ParseUUIDPipe) id: string) {
    return this.cardAnexosService.listar(id);
  }

  @Get(':id/anexos/:anexoId')
  @RequerPermissao('card.visualizar', porCard())
  async baixarAnexo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('anexoId', ParseUUIDPipe) anexoId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { anexo, stream } = await this.cardAnexosService.baixar(
      id,
      anexoId,
    );
    res.set({
      'Content-Type': anexo.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(anexo.nomeOriginal)}`,
      'Content-Length': anexo.tamanho,
    });
    return new StreamableFile(stream);
  }

  @Delete(':id/anexos/:anexoId')
  @RequerPermissao('card.editar', porCard())
  @HttpCode(204)
  removerAnexo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('anexoId', ParseUUIDPipe) anexoId: string,
  ) {
    return this.cardAnexosService.remover(id, anexoId);
  }

  @Post(':id/comentarios')
  @RequerPermissao('comentario.criar', porCard())
  criarComentario(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateComentarioDto,
  ) {
    return this.comentariosService.criar(id, dto);
  }

  @Get(':id/comentarios')
  @RequerPermissao('card.visualizar', porCard())
  listarComentarios(@Param('id', ParseUUIDPipe) id: string) {
    return this.comentariosService.listar(id);
  }

  @Patch(':id/comentarios/:comentarioId')
  @RequerPermissao('comentario.editar', porCard())
  editarComentario(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('comentarioId', ParseUUIDPipe) comentarioId: string,
    @Body() dto: CreateComentarioDto,
  ) {
    return this.comentariosService.editar(id, comentarioId, dto);
  }

  @Delete(':id/comentarios/:comentarioId')
  @RequerPermissao('comentario.remover', porCard())
  @HttpCode(204)
  removerComentario(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('comentarioId', ParseUUIDPipe) comentarioId: string,
    @Body() dto: RemoverComentarioDto,
  ) {
    return this.comentariosService.remover(id, comentarioId, dto);
  }
}
