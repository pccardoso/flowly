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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IntegracoesService } from './integracoes.service';
import { CreateIntegracaoDto } from './dto/create-integracao.dto';
import { UpdateIntegracaoDto } from './dto/update-integracao.dto';
import { CATALOGO_STEP_TIPOS } from './step-tipo-catalogo';
import { PermissoesGuard } from '../permissoes/guards/permissoes.guard';
import { RequerPermissao } from '../permissoes/decorators/requer-permissao.decorator';
import { porParametro } from '../permissoes/decorators/resolvedores';

const TAMANHO_MAXIMO_ARQUIVO_STEP = 25 * 1024 * 1024;

@Controller('processos/:processoId/integracoes')
@UseGuards(PermissoesGuard)
export class IntegracoesController {
  constructor(private readonly integracoesService: IntegracoesService) {}

  // Staging de arquivo pro step ACAO_ANEXAR_ARQUIVO — ver
  // IntegracoesService.uploadArquivoStep pra entender por que essa rota não
  // é aninhada sob um step específico. Front sobe cada arquivo aqui (até 5
  // por step) e usa o retorno em config.arquivos ao criar/editar o step.
  @Post('arquivos-step')
  @RequerPermissao('integracao.criar', porParametro('processoId'))
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: memoryStorage(),
      limits: { fileSize: TAMANHO_MAXIMO_ARQUIVO_STEP },
    }),
  )
  uploadArquivoStep(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @UploadedFile() arquivo?: Express.Multer.File,
  ) {
    if (!arquivo) {
      throw new BadRequestException(
        'Arquivo é obrigatório (campo multipart "arquivo")',
      );
    }
    return this.integracoesService.uploadArquivoStep(processoId, arquivo);
  }

  // Metadado estático pro front montar o editor visual (categorias, campos
  // de config esperados por tipo, formato de saída) — não depende do banco.
  @Get('tipos-step')
  @RequerPermissao('integracao.visualizar', porParametro('processoId'))
  listarTiposStep() {
    return CATALOGO_STEP_TIPOS;
  }

  @Get()
  @RequerPermissao('integracao.visualizar', porParametro('processoId'))
  listar(@Param('processoId', ParseUUIDPipe) processoId: string) {
    return this.integracoesService.listarPorProcesso(processoId);
  }

  @Get(':integracaoId')
  @RequerPermissao('integracao.visualizar', porParametro('processoId'))
  buscar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('integracaoId', ParseUUIDPipe) integracaoId: string,
  ) {
    return this.integracoesService.buscar(processoId, integracaoId);
  }

  @Get(':integracaoId/execucoes')
  @RequerPermissao('integracao.visualizar', porParametro('processoId'))
  listarExecucoes(@Param('integracaoId', ParseUUIDPipe) integracaoId: string) {
    return this.integracoesService.listarExecucoesPorIntegracao(integracaoId);
  }

  @Post()
  @RequerPermissao('integracao.criar', porParametro('processoId'))
  criar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Body() dto: CreateIntegracaoDto,
  ) {
    return this.integracoesService.criar(processoId, dto);
  }

  @Patch(':integracaoId')
  @RequerPermissao('integracao.editar', porParametro('processoId'))
  atualizar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('integracaoId', ParseUUIDPipe) integracaoId: string,
    @Body() dto: UpdateIntegracaoDto,
  ) {
    return this.integracoesService.atualizar(processoId, integracaoId, dto);
  }

  @Delete(':integracaoId')
  @RequerPermissao('integracao.remover', porParametro('processoId'))
  @HttpCode(204)
  remover(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('integracaoId', ParseUUIDPipe) integracaoId: string,
  ) {
    return this.integracoesService.remover(processoId, integracaoId);
  }
}
