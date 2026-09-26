import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { FormulariosService } from './formularios.service';
import { FormularioExternoGuard } from './guards/formulario-externo.guard';
import { PreencherFormularioEntradaDto } from './dto/preencher-formulario-entrada.dto';
import { AtualizarCardViaFormularioFaseDto } from './dto/atualizar-card-via-formulario-fase.dto';

const TAMANHO_MAXIMO_ANEXO = 25 * 1024 * 1024;

// Rotas de preenchimento externo de formulário (fora do app interno de
// kanban): sempre @Public() pra escapar do JwtAuthGuard global, e sempre
// guardadas por FormularioExternoGuard, que decide em runtime (consultando
// Processo.formularioExternoRequerAutenticacao) se exige JWT válido ou não —
// não usa @RequerPermissao/PermissoesGuard, ver formulario-externo.guard.ts.
@Controller('formularios')
@Public()
@UseGuards(FormularioExternoGuard)
export class FormulariosController {
  constructor(private readonly formulariosService: FormulariosService) {}

  // Metadata do formulário de entrada (link = só processoId): o front usa
  // pra saber quais campos pedir e se precisa mandar o usuário logar antes.
  @Get('processos/:processoId')
  obterFormularioEntrada(
    @Param('processoId', ParseUUIDPipe) processoId: string,
  ) {
    return this.formulariosService.obterFormularioEntrada(processoId);
  }

  @Post('processos/:processoId/cards')
  criarCardViaFormularioEntrada(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Body() dto: PreencherFormularioEntradaDto,
    @CurrentUser() usuario: JwtPayload | undefined,
  ) {
    return this.formulariosService.criarCardViaFormularioEntrada(
      processoId,
      dto,
      usuario?.sub ?? null,
    );
  }

  // Anexo no card já criado por este mesmo formulário — não passa pela rota
  // interna equivalente (POST /cards/:id/anexos), que exige card.editar via
  // grupo/PermissoesGuard. Aqui vale a mesma exceção do resto do módulo.
  @Post('processos/:processoId/cards/:cardId/anexos')
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: memoryStorage(),
      limits: { fileSize: TAMANHO_MAXIMO_ANEXO },
    }),
  )
  enviarAnexo(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @CurrentUser() usuario: JwtPayload | undefined,
    @UploadedFile() arquivo?: Express.Multer.File,
  ) {
    if (!arquivo) {
      throw new BadRequestException(
        'Arquivo é obrigatório (campo multipart "arquivo")',
      );
    }
    return this.formulariosService.enviarAnexoViaFormularioEntrada(
      processoId,
      cardId,
      arquivo,
      usuario?.sub ?? null,
    );
  }

  // Metadata do formulário de fase (link = mesclagem processoId + faseId): o
  // front usa pra saber quais campos pedir ao preencher um card que já está
  // nessa fase — ao contrário do de entrada, não cria card.
  @Get('processos/:processoId/fases/:faseId')
  obterFormularioFase(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('faseId', ParseUUIDPipe) faseId: string,
  ) {
    return this.formulariosService.obterFormularioFase(processoId, faseId);
  }

  // Submissão do formulário de fase: atualiza campos de um card que já
  // existe e já está nessa fase (link = mesclagem processoId + faseId +
  // cardId). Nunca cria card novo — ver criarCardViaFormularioEntrada acima
  // pra esse caso.
  @Patch('processos/:processoId/fases/:faseId/cards/:cardId')
  atualizarCardViaFormularioFase(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('faseId', ParseUUIDPipe) faseId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: AtualizarCardViaFormularioFaseDto,
    @CurrentUser() usuario: JwtPayload | undefined,
  ) {
    return this.formulariosService.atualizarCardViaFormularioFase(
      processoId,
      faseId,
      cardId,
      dto,
      usuario?.sub ?? null,
    );
  }
}
