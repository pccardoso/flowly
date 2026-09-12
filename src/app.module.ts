import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Processo } from './processos/entities/processo.entity';
import { Fase } from './fases/entities/fase.entity';
import { FaseTransicao } from './fases/entities/fase-transicao.entity';
import { ProcessoConexao } from './processos/entities/processo-conexao.entity';
import { Card } from './cards/entities/card.entity';
import { CardMovimentacao } from './cards/entities/card-movimentacao.entity';
import { CardAnexo } from './cards/entities/card-anexo.entity';
import { CardComentario } from './cards/entities/card-comentario.entity';
import { User } from './users/entities/user.entity';
import { Automacao } from './automacoes/entities/automacao.entity';
import { AutomacaoAcao } from './automacoes/entities/automacao-acao.entity';
import { AutomacaoExecucao } from './automacoes/entities/automacao-execucao.entity';
import { Permissao } from './permissoes/entities/permissao.entity';
import { Grupo } from './permissoes/entities/grupo.entity';
import { GrupoUsuario } from './permissoes/entities/grupo-usuario.entity';
import { GrupoProcesso } from './permissoes/entities/grupo-processo.entity';
import { GrupoOrganizacaoPermissao } from './permissoes/entities/grupo-organizacao-permissao.entity';
import { GrupoProcessoPermissao } from './permissoes/entities/grupo-processo-permissao.entity';
import { ProcessosModule } from './processos/processos.module';
import { CardsModule } from './cards/cards.module';
import { AutomacoesModule } from './automacoes/automacoes.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PermissoesModule } from './permissoes/permissoes.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME ?? 'piipefy',
      password: process.env.DB_PASSWORD ?? 'piipefy',
      database: process.env.DB_DATABASE ?? 'piipefy',
      entities: [
        Processo,
        Fase,
        FaseTransicao,
        ProcessoConexao,
        Card,
        CardMovimentacao,
        CardAnexo,
        CardComentario,
        User,
        Automacao,
        AutomacaoAcao,
        AutomacaoExecucao,
        Permissao,
        Grupo,
        GrupoUsuario,
        GrupoProcesso,
        GrupoOrganizacaoPermissao,
        GrupoProcessoPermissao,
      ],
      synchronize: true,
    }),
    ProcessosModule,
    CardsModule,
    AutomacoesModule,
    UsersModule,
    AuthModule,
    PermissoesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
