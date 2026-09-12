import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { PermissoesService } from './permissoes.service';
import { PermissoesGuard } from './guards/permissoes.guard';
import { RequerPermissao } from './decorators/requer-permissao.decorator';
import { CreateGrupoDto } from './dto/create-grupo.dto';
import { UpdateGrupoDto } from './dto/update-grupo.dto';
import { AdicionarMembroDto } from './dto/adicionar-membro.dto';
import { AssociarProcessoDto } from './dto/associar-processo.dto';
import { DefinirPermissoesDto } from './dto/definir-permissoes.dto';

// Gerenciamento de grupo é sempre checado a nível de Organização (nunca de
// Processo específico) — é uma capacidade administrativa global, não algo
// delegável por processo.
@Controller('grupos')
@UseGuards(PermissoesGuard)
export class GruposController {
  constructor(private readonly permissoesService: PermissoesService) {}

  @Get()
  listar() {
    return this.permissoesService.listarGrupos();
  }

  @Get(':id')
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissoesService.buscarGrupo(id);
  }

  @Post()
  @RequerPermissao('grupo.criar')
  criar(@Body() dto: CreateGrupoDto) {
    return this.permissoesService.criarGrupo(dto.nome);
  }

  @Patch(':id')
  @RequerPermissao('grupo.editar')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGrupoDto,
  ) {
    return this.permissoesService.atualizarGrupo(id, dto.nome);
  }

  @Delete(':id')
  @RequerPermissao('grupo.remover')
  async remover(@Param('id', ParseUUIDPipe) id: string) {
    await this.permissoesService.removerGrupo(id);
  }

  @Post(':id/usuarios')
  @RequerPermissao('grupo.gerenciar_membros')
  adicionarMembro(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdicionarMembroDto,
  ) {
    return this.permissoesService.adicionarMembro(id, dto.usuarioId);
  }

  @Delete(':id/usuarios/:usuarioId')
  @RequerPermissao('grupo.gerenciar_membros')
  removerMembro(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
  ) {
    return this.permissoesService.removerMembro(id, usuarioId);
  }

  @Post(':id/processos')
  @RequerPermissao('grupo.gerenciar_processos')
  associarProcesso(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssociarProcessoDto,
  ) {
    return this.permissoesService.associarProcesso(id, dto.processoId);
  }

  @Delete(':id/processos/:processoId')
  @RequerPermissao('grupo.gerenciar_processos')
  desassociarProcesso(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('processoId', ParseUUIDPipe) processoId: string,
  ) {
    return this.permissoesService.desassociarProcesso(id, processoId);
  }

  @Put(':id/permissoes-organizacao')
  @RequerPermissao('grupo.gerenciar_permissoes')
  definirPermissoesOrganizacao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DefinirPermissoesDto,
  ) {
    return this.permissoesService.definirPermissoesOrganizacao(id, dto.aliases);
  }

  @Put(':id/processos/:processoId/permissoes')
  @RequerPermissao('grupo.gerenciar_permissoes')
  definirPermissoesProcesso(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Body() dto: DefinirPermissoesDto,
  ) {
    return this.permissoesService.definirPermissoesProcesso(
      id,
      processoId,
      dto.aliases,
    );
  }
}
