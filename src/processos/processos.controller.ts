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
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ProcessosService } from './processos.service';
import { CreateProcessoDto } from './dto/create-processo.dto';
import { UpdateProcessoDto } from './dto/update-processo.dto';
import { CreateFaseDto } from './dto/create-fase.dto';
import { UpdateFaseDto } from './dto/update-fase.dto';
import { CreateFaseTransicaoDto } from './dto/create-fase-transicao.dto';
import { UpdateFaseTransicaoDto } from './dto/update-fase-transicao.dto';
import { CreateProcessoConexaoDto } from './dto/create-processo-conexao.dto';
import { DefinirFormularioEntradaDto } from './dto/definir-formulario-entrada.dto';
import { PermissoesGuard } from '../permissoes/guards/permissoes.guard';
import { PermissoesService } from '../permissoes/permissoes.service';
import { RequerPermissao } from '../permissoes/decorators/requer-permissao.decorator';
import { porParametro } from '../permissoes/decorators/resolvedores';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const TAMANHO_MAXIMO_IMAGEM = 10 * 1024 * 1024;

@Controller('processos')
@UseGuards(PermissoesGuard)
export class ProcessosController {
  constructor(
    private readonly processosService: ProcessosService,
    private readonly permissoesService: PermissoesService,
  ) {}

  // Sem @RequerPermissao (não dá pra checar um único processoId numa
  // listagem) — filtra a lista em vez de barrar a rota inteira: cada
  // processo só aparece se o usuário tiver processo.visualizar nele
  // (organização ou override de processo).
  @Get()
  async listar(@CurrentUser() usuario: JwtPayload) {
    const processos = await this.processosService.listar();
    if (usuario.isSuperAdmin) {
      return processos;
    }
    const permitidos = await Promise.all(
      processos.map((p) =>
        this.permissoesService.usuarioTemPermissao(
          usuario.sub,
          'processo.visualizar',
          p.id,
        ),
      ),
    );
    return processos.filter((_, i) => permitidos[i]);
  }

  @Post()
  @RequerPermissao('processo.criar')
  criar(@Body() dto: CreateProcessoDto) {
    return this.processosService.criar(dto);
  }

  @Patch(':id')
  @RequerPermissao('processo.editar', porParametro('id'))
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProcessoDto,
  ) {
    return this.processosService.atualizar(id, dto);
  }

  @Put(':id/formulario-entrada')
  @RequerPermissao('processo.editar', porParametro('id'))
  definirFormularioEntrada(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DefinirFormularioEntradaDto,
  ) {
    return this.processosService.definirFormularioEntrada(id, dto);
  }

  @Post(':id/imagem')
  @RequerPermissao('processo.editar', porParametro('id'))
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: memoryStorage(),
      limits: { fileSize: TAMANHO_MAXIMO_IMAGEM },
    }),
  )
  enviarImagem(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() arquivo?: Express.Multer.File,
  ) {
    if (!arquivo) {
      throw new BadRequestException(
        'Arquivo é obrigatório (campo multipart "arquivo")',
      );
    }
    if (!arquivo.mimetype.startsWith('image/')) {
      throw new BadRequestException('Arquivo precisa ser uma imagem');
    }
    return this.processosService.enviarImagem(id, arquivo);
  }

  @Get(':id/imagem')
  @RequerPermissao('processo.visualizar', porParametro('id'))
  async baixarImagem(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { mimeType, stream } = await this.processosService.obterImagem(id);
    res.set({ 'Content-Type': mimeType });
    return new StreamableFile(stream);
  }

  @Get(':id/configuracoes')
  @RequerPermissao('processo.visualizar', porParametro('id'))
  buscarConfiguracoes(@Param('id', ParseUUIDPipe) id: string) {
    return this.processosService.buscarConfiguracoes(id);
  }

  @Post(':id/fases')
  @RequerPermissao('fase.criar', porParametro('id'))
  criarFase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFaseDto,
  ) {
    return this.processosService.criarFase(id, dto);
  }

  @Patch(':id/fases/:faseId')
  @RequerPermissao('fase.editar', porParametro('id'))
  atualizarFase(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('faseId', ParseUUIDPipe) faseId: string,
    @Body() dto: UpdateFaseDto,
  ) {
    return this.processosService.atualizarFase(id, faseId, dto);
  }

  @Delete(':id/fases/:faseId')
  @RequerPermissao('fase.remover', porParametro('id'))
  @HttpCode(204)
  removerFase(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('faseId', ParseUUIDPipe) faseId: string,
  ) {
    return this.processosService.removerFase(id, faseId);
  }

  @Post(':id/transicoes')
  @RequerPermissao('transicao.criar', porParametro('id'))
  criarTransicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFaseTransicaoDto,
  ) {
    return this.processosService.criarTransicao(id, dto);
  }

  @Patch(':id/transicoes/:transicaoId')
  @RequerPermissao('transicao.editar', porParametro('id'))
  atualizarTransicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('transicaoId', ParseUUIDPipe) transicaoId: string,
    @Body() dto: UpdateFaseTransicaoDto,
  ) {
    return this.processosService.atualizarTransicao(id, transicaoId, dto);
  }

  @Delete(':id/transicoes/:transicaoId')
  @RequerPermissao('transicao.remover', porParametro('id'))
  @HttpCode(204)
  removerTransicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('transicaoId', ParseUUIDPipe) transicaoId: string,
  ) {
    return this.processosService.removerTransicao(id, transicaoId);
  }

  @Post(':id/conexoes')
  @RequerPermissao('processo.editar', porParametro('id'))
  criarConexao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProcessoConexaoDto,
  ) {
    return this.processosService.criarConexao(id, dto);
  }

  @Get(':id/conexoes')
  @RequerPermissao('processo.visualizar', porParametro('id'))
  listarConexoes(@Param('id', ParseUUIDPipe) id: string) {
    return this.processosService.listarConexoes(id);
  }

  @Delete(':id/conexoes/:conexaoId')
  @RequerPermissao('processo.editar', porParametro('id'))
  removerConexao(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('conexaoId', ParseUUIDPipe) conexaoId: string,
  ) {
    return this.processosService.removerConexao(id, conexaoId);
  }

  @Delete(':id')
  @RequerPermissao('processo.remover', porParametro('id'))
  @HttpCode(204)
  remover(@Param('id', ParseUUIDPipe) id: string) {
    return this.processosService.remover(id);
  }
}
