import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AtualizarMeuPerfilDto } from './dto/atualizar-meu-perfil.dto';
import { PermissoesGuard } from '../permissoes/guards/permissoes.guard';
import { RequerPermissao } from '../permissoes/decorators/requer-permissao.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const TAMANHO_MAXIMO_AVATAR = 5 * 1024 * 1024;

@Controller('usuarios')
@UseGuards(PermissoesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Cadastro fechado: criar usuário agora exige permissão usuario.criar (só
  // admin). O primeiro usuário do sistema (antes de qualquer grupo/
  // permissão existir) precisa ser inserido direto no banco — não tem mais
  // rota pública de auto-cadastro.
  @Post()
  @RequerPermissao('usuario.criar')
  criar(@Body() dto: CreateUserDto) {
    return this.usersService.criar(dto);
  }

  // Diretório de baixo risco (sem senha/hash exposto, sem bloqueado
  // aparecendo), usado pra montar grupos e escolher conta de serviço de
  // Integração — sem alias específico, mesmo padrão de antes. Nunca inclui
  // usuário bloqueado (ver UsersService.listar).
  @Get()
  listar() {
    return this.usersService.listar();
  }

  // Listagem completa (inclui bloqueados) pra tela de gerenciamento —
  // declarada antes de ':id' pra "gerenciar" não ser interpretado como um
  // uuid de usuário.
  @Get('gerenciar')
  @RequerPermissao('usuario.visualizar')
  listarParaGerenciamento() {
    return this.usersService.listarParaGerenciamento();
  }

  // Autoedição — sem @RequerPermissao de propósito (qualquer usuário
  // autenticado pode ver/editar o próprio perfil, não depende de
  // usuario.visualizar/usuario.editar). Declaradas antes de ':id' pelo mesmo
  // motivo de "gerenciar" acima: "me" não pode ser interpretado como uuid.
  // GET existe separado do que o login já devolve porque o front precisa
  // recarregar o perfil (nome/avatar atualizados) sem passar pelo login de
  // novo — ex.: restaurar sessão a partir de um JWT salvo após um refresh de
  // página.
  @Get('me')
  buscarMeuPerfil(@CurrentUser() usuarioAtual: JwtPayload) {
    return this.usersService.buscarPorId(usuarioAtual.sub);
  }

  @Patch('me')
  atualizarMeuPerfil(
    @Body() dto: AtualizarMeuPerfilDto,
    @CurrentUser() usuarioAtual: JwtPayload,
  ) {
    return this.usersService.atualizarMeuPerfil(usuarioAtual.sub, dto);
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: memoryStorage(),
      limits: { fileSize: TAMANHO_MAXIMO_AVATAR },
    }),
  )
  enviarMeuAvatar(
    @CurrentUser() usuarioAtual: JwtPayload,
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
    return this.usersService.enviarAvatar(usuarioAtual.sub, arquivo);
  }

  // Visível pra qualquer usuário autenticado (sem @RequerPermissao) — avatar
  // não é dado sensível, e listagens de card/responsável/comentário
  // precisam poder exibir o avatar de qualquer usuário envolvido, não só o
  // próprio.
  @Get(':id/avatar')
  async baixarAvatar(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { mimeType, stream } = await this.usersService.obterAvatar(id);
    res.set({ 'Content-Type': mimeType });
    return new StreamableFile(stream);
  }

  @Get(':id')
  @RequerPermissao('usuario.visualizar')
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.buscarPorId(id);
  }

  @Patch(':id')
  @RequerPermissao('usuario.editar')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.atualizar(id, dto);
  }

  @Post(':id/bloquear')
  @RequerPermissao('usuario.bloquear')
  @HttpCode(200)
  bloquear(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuarioAtual: JwtPayload,
  ) {
    return this.usersService.bloquear(id, usuarioAtual.sub);
  }

  @Post(':id/desbloquear')
  @RequerPermissao('usuario.bloquear')
  @HttpCode(200)
  desbloquear(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.desbloquear(id);
  }
}
