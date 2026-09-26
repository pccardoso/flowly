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
  UseGuards,
} from '@nestjs/common';
import { EmailService } from './email.service';
import { CreateProvedorEmailDto } from './dto/create-provedor-email.dto';
import { UpdateProvedorEmailDto } from './dto/update-provedor-email.dto';
import { PermissoesGuard } from '../permissoes/guards/permissoes.guard';
import { RequerPermissao } from '../permissoes/decorators/requer-permissao.decorator';

// Sem resolvedorProcessoId em nenhuma rota: ProvedorEmail é configuração
// global (não há entity Organizacao/multi-tenant neste app — ver
// CLAUDE.md), então a checagem de permissão é sempre de nível Organização,
// mesmo padrão de UsersController.
@Controller()
@UseGuards(PermissoesGuard)
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Get('provedores-email')
  @RequerPermissao('provedorEmail.visualizar')
  listarProvedores() {
    return this.emailService.listarProvedores();
  }

  @Get('provedores-email/:id')
  @RequerPermissao('provedorEmail.visualizar')
  buscarProvedor(@Param('id', ParseUUIDPipe) id: string) {
    return this.emailService.buscarProvedor(id);
  }

  @Post('provedores-email')
  @RequerPermissao('provedorEmail.criar')
  criarProvedor(@Body() dto: CreateProvedorEmailDto) {
    return this.emailService.criarProvedor(dto);
  }

  @Patch('provedores-email/:id')
  @RequerPermissao('provedorEmail.editar')
  atualizarProvedor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProvedorEmailDto,
  ) {
    return this.emailService.atualizarProvedor(id, dto);
  }

  @Delete('provedores-email/:id')
  @RequerPermissao('provedorEmail.remover')
  @HttpCode(204)
  removerProvedor(@Param('id', ParseUUIDPipe) id: string) {
    return this.emailService.removerProvedor(id);
  }

  // Auditoria dos envios disparados por steps EMAIL — ver EmailEnvio.
  @Get('email-envios')
  @RequerPermissao('provedorEmail.visualizar')
  listarEnvios(@Query('cardId') cardId?: string) {
    return this.emailService.listarEnvios(cardId);
  }

  @Get('email-envios/:id')
  @RequerPermissao('provedorEmail.visualizar')
  buscarEnvio(@Param('id', ParseUUIDPipe) id: string) {
    return this.emailService.buscarEnvio(id);
  }
}
