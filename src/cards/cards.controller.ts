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
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CardsService } from './cards.service';
import { CardAnexosService } from './anexos.service';
import {
  ComentariosService,
  MAX_ANEXOS_POR_COMENTARIO,
} from './comentarios.service';
import { CardPdfEmissaoService } from '../pdf-modelos/card-pdf-emissao.service';
import { CardResponsaveisService } from './card-responsaveis.service';
import { AtualizarResponsaveisDto } from './dto/atualizar-responsaveis.dto';
import { CardEtiquetasService } from './card-etiquetas.service';
import { CardsBuscaService } from './cards-busca.service';
import { BuscarCardsDto, BuscarCardsPaginadoDto } from './dto/buscar-cards.dto';
import { AtualizarEtiquetasDto } from './dto/atualizar-etiquetas.dto';
import { CreateCardDto } from './dto/create-card.dto';
import { AtualizarVencimentoDto } from './dto/atualizar-vencimento.dto';
import { UpdateCardCamposDto } from './dto/update-card-campos.dto';
import { MoverCardDto } from './dto/mover-card.dto';
import { CreateCardFilhoDto } from './dto/create-card-filho.dto';
import { ListarCardsPaginadoQueryDto } from './dto/listar-cards-paginado-query.dto';
import { ListarHistoricoQueryDto } from './dto/listar-historico-query.dto';
import { CreateComentarioDto } from './dto/create-comentario.dto';
import { PermissoesGuard } from '../permissoes/guards/permissoes.guard';
import { RequerPermissao } from '../permissoes/decorators/requer-permissao.decorator';
import {
  porBody,
  porCard,
  porQuery,
} from '../permissoes/decorators/resolvedores';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const TAMANHO_MAXIMO_ANEXO = 25 * 1024 * 1024;

@Controller('cards')
@UseGuards(PermissoesGuard)
export class CardsController {
  constructor(
    private readonly cardsService: CardsService,
    private readonly cardAnexosService: CardAnexosService,
    private readonly comentariosService: ComentariosService,
    private readonly cardPdfEmissaoService: CardPdfEmissaoService,
    private readonly cardResponsaveisService: CardResponsaveisService,
    private readonly cardEtiquetasService: CardEtiquetasService,
    private readonly cardsBuscaService: CardsBuscaService,
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
      query.vencimento,
    );
  }

  // Catálogo pra montar a busca inteligente: campos filtráveis, tipo de cada
  // um, operadores permitidos e opções (fases, etiquetas, responsáveis...).
  @Get('filtros-disponiveis')
  @RequerPermissao('card.visualizar', porQuery('processoId'))
  filtrosDisponiveis(@Query('processoId', ParseUUIDPipe) processoId: string) {
    return this.cardsBuscaService.catalogo(processoId);
  }

  // Kanban filtrado: todos os cards que batem (mesmo formato de GET /cards).
  @Post('busca')
  @HttpCode(200)
  @RequerPermissao('card.visualizar', porBody('processoId'))
  buscar(@Body() dto: BuscarCardsDto) {
    return this.cardsBuscaService.buscar(dto);
  }

  // Lista filtrada e paginada (mesmo formato de GET /cards/paginado).
  @Post('busca/paginado')
  @HttpCode(200)
  @RequerPermissao('card.visualizar', porBody('processoId'))
  buscarPaginado(@Body() dto: BuscarCardsPaginadoDto) {
    return this.cardsBuscaService.buscarPaginado(dto);
  }

  @Post()
  @RequerPermissao('card.criar', porBody('processoId'))
  criar(@Body() dto: CreateCardDto, @CurrentUser() usuario: JwtPayload) {
    return this.cardsService.criar(dto, usuario.sub);
  }

  @Patch(':id/campos')
  @RequerPermissao('card.editar', porCard())
  atualizarCampos(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCardCamposDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.cardsService.atualizarCampos(id, dto, usuario.sub);
  }

  // Define a data/hora de vencimento (ISO 8601) ou remove com null.
  @Patch(':id/vencimento')
  @RequerPermissao('card.editar', porCard())
  atualizarVencimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarVencimentoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.cardsService.atualizarVencimento(id, dto.dataVencimento, {
      usuarioId: usuario.sub,
      automatico: false,
    });
  }

  @Post(':id/movimentacoes')
  @RequerPermissao('card.mover', porCard())
  mover(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoverCardDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.cardsService.mover(id, dto, usuario.sub);
  }

  @Get(':id/automacoes-execucoes')
  @RequerPermissao('card.visualizar', porCard())
  listarExecucoes(@Param('id', ParseUUIDPipe) id: string) {
    return this.cardsService.listarExecucoes(id);
  }

  @Get(':id/integracoes-execucoes')
  @RequerPermissao('card.visualizar', porCard())
  listarExecucoesIntegracoes(@Param('id', ParseUUIDPipe) id: string) {
    return this.cardsService.listarExecucoesIntegracoes(id);
  }

  @Get(':id/historico')
  @RequerPermissao('card.visualizar', porCard())
  listarHistorico(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListarHistoricoQueryDto,
  ) {
    return this.cardsService.listarHistorico(
      id,
      query.tipo,
      query.page,
      query.perPage,
    );
  }

  @Get(':id')
  @RequerPermissao('card.visualizar', porCard())
  buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    return this.cardsService.buscarPorId(id);
  }

  // Mesmo dado que FormulariosService.obterFormularioFase (rota pública),
  // mas atrás de card.visualizar em vez de aberto pra qualquer usuário
  // logado — pro painel interno saber quais campos mostrar/editar conforme
  // a fase atual do card, sem depender da rota pensada pro link externo.
  @Get(':id/formulario-fase')
  @RequerPermissao('card.visualizar', porCard())
  buscarFormularioFase(@Param('id', ParseUUIDPipe) id: string) {
    return this.cardsService.buscarFormularioFase(id);
  }

  @Post(':id/conexoes/:conexaoId/filhos')
  @RequerPermissao('card.criar', porCard())
  criarFilho(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('conexaoId', ParseUUIDPipe) conexaoId: string,
    @Body() dto: CreateCardFilhoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.cardsService.criarFilho(id, conexaoId, dto, usuario.sub);
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
    @CurrentUser() usuario: JwtPayload,
    @UploadedFile() arquivo?: Express.Multer.File,
  ) {
    if (!arquivo) {
      throw new BadRequestException(
        'Arquivo é obrigatório (campo multipart "arquivo")',
      );
    }
    return this.cardAnexosService.enviar(id, arquivo, usuario.sub);
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
    const { anexo, stream } = await this.cardAnexosService.baixar(id, anexoId);
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
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.cardAnexosService.remover(id, anexoId, usuario.sub);
  }

  @Post(':id/pdf-modelos/:modeloId/emitir')
  @RequerPermissao('pdfModelo.emitir', porCard())
  @HttpCode(202)
  emitirPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('modeloId', ParseUUIDPipe) modeloId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.cardPdfEmissaoService.emitir(id, modeloId, usuario.sub);
  }

  @Get(':id/pdf-emissoes')
  @RequerPermissao('card.visualizar', porCard())
  listarPdfEmissoes(@Param('id', ParseUUIDPipe) id: string) {
    return this.cardPdfEmissaoService.listar(id);
  }

  @Get(':id/pdf-emissoes/:emissaoId')
  @RequerPermissao('card.visualizar', porCard())
  buscarPdfEmissao(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('emissaoId', ParseUUIDPipe) emissaoId: string,
  ) {
    return this.cardPdfEmissaoService.buscar(id, emissaoId);
  }

  @Get(':id/pdf-emissoes/:emissaoId/download')
  @RequerPermissao('card.visualizar', porCard())
  async baixarPdfEmissao(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('emissaoId', ParseUUIDPipe) emissaoId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { emissao, stream } = await this.cardPdfEmissaoService.baixar(
      id,
      emissaoId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${emissao.modeloNomeSnapshot}.pdf`)}`,
    });
    return new StreamableFile(stream);
  }

  @Get(':id/responsaveis')
  @RequerPermissao('card.visualizar', porCard())
  listarResponsaveis(@Param('id', ParseUUIDPipe) id: string) {
    return this.cardResponsaveisService.listar(id);
  }

  // Substitui a lista inteira de responsáveis (array vazio remove todos).
  // Sem trava de "só o próprio responsável pode se remover" ou "usuário A
  // não pode mexer no card do usuário B" por enquanto — só card.editar,
  // igual qualquer outra mutação de card (ver conversa).
  @Put(':id/responsaveis')
  @RequerPermissao('card.editar', porCard())
  atualizarResponsaveis(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarResponsaveisDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.cardResponsaveisService.atualizar(id, dto.usuarioIds, {
      usuarioId: usuario.sub,
      automatico: false,
    });
  }

  @Get(':id/etiquetas')
  @RequerPermissao('card.visualizar', porCard())
  listarEtiquetas(@Param('id', ParseUUIDPipe) id: string) {
    return this.cardEtiquetasService.listar(id);
  }

  // Substitui a lista inteira de etiquetas do card (array vazio remove todas).
  @Put(':id/etiquetas')
  @RequerPermissao('card.editar', porCard())
  atualizarEtiquetas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarEtiquetasDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.cardEtiquetasService.atualizar(id, dto.etiquetaIds, {
      usuarioId: usuario.sub,
      automatico: false,
    });
  }

  // Idempotente: se o card já tem a etiqueta, devolve a lista sem alterar.
  @Post(':id/etiquetas/:etiquetaId')
  @HttpCode(200)
  @RequerPermissao('card.editar', porCard())
  adicionarEtiqueta(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('etiquetaId', ParseUUIDPipe) etiquetaId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.cardEtiquetasService.adicionar(id, etiquetaId, {
      usuarioId: usuario.sub,
      automatico: false,
    });
  }

  // Idempotente: se o card não tem a etiqueta, devolve a lista sem alterar.
  @Delete(':id/etiquetas/:etiquetaId')
  @RequerPermissao('card.editar', porCard())
  removerEtiqueta(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('etiquetaId', ParseUUIDPipe) etiquetaId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.cardEtiquetasService.remover(id, etiquetaId, {
      usuarioId: usuario.sub,
      automatico: false,
    });
  }

  // Aceita JSON ({ texto }) ou multipart/form-data (`texto` + até
  // MAX_ANEXOS_POR_COMENTARIO arquivos no campo repetido `arquivos`). Os
  // arquivos viram anexos do card e o comentário só os referencia.
  @Post(':id/comentarios')
  @RequerPermissao('comentario.criar', porCard())
  @UseInterceptors(
    FilesInterceptor('arquivos', MAX_ANEXOS_POR_COMENTARIO, {
      storage: memoryStorage(),
      limits: { fileSize: TAMANHO_MAXIMO_ANEXO },
    }),
  )
  criarComentario(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateComentarioDto,
    @CurrentUser() usuario: JwtPayload,
    @UploadedFiles() arquivos?: Express.Multer.File[],
  ) {
    return this.comentariosService.criar(id, dto, usuario.sub, arquivos ?? []);
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
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.comentariosService.editar(id, comentarioId, dto, usuario.sub);
  }

  @Delete(':id/comentarios/:comentarioId')
  @RequerPermissao('comentario.remover', porCard())
  @HttpCode(204)
  removerComentario(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('comentarioId', ParseUUIDPipe) comentarioId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.comentariosService.remover(id, comentarioId, usuario.sub);
  }
}
