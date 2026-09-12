import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permissao } from './entities/permissao.entity';
import { Grupo } from './entities/grupo.entity';
import { GrupoUsuario } from './entities/grupo-usuario.entity';
import { GrupoProcesso } from './entities/grupo-processo.entity';
import { GrupoOrganizacaoPermissao } from './entities/grupo-organizacao-permissao.entity';
import { GrupoProcessoPermissao } from './entities/grupo-processo-permissao.entity';
import { User } from '../users/entities/user.entity';
import { Processo } from '../processos/entities/processo.entity';
import { PermissoesService } from './permissoes.service';
import { PermissoesGuard } from './guards/permissoes.guard';
import { GruposController } from './grupos.controller';
import { PermissoesController } from './permissoes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Permissao,
      Grupo,
      GrupoUsuario,
      GrupoProcesso,
      GrupoOrganizacaoPermissao,
      GrupoProcessoPermissao,
      User,
      Processo,
    ]),
  ],
  controllers: [GruposController, PermissoesController],
  providers: [PermissoesService, PermissoesGuard],
  exports: [PermissoesService, PermissoesGuard],
})
export class PermissoesModule {}
