import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
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
import { CardComentarioAnexo } from './cards/entities/card-comentario-anexo.entity';
import { CardEvento } from './cards/entities/card-evento.entity';
import { CardPdfEmissao } from './cards/entities/card-pdf-emissao.entity';
import { CardResponsavel } from './cards/entities/card-responsavel.entity';
import { CardEtiqueta } from './cards/entities/card-etiqueta.entity';
import { CardVencimentoDisparo } from './cards/entities/card-vencimento-disparo.entity';
import { Etiqueta } from './etiquetas/entities/etiqueta.entity';
import { User } from './users/entities/user.entity';
import { Automacao } from './automacoes/entities/automacao.entity';
import { AutomacaoAcao } from './automacoes/entities/automacao-acao.entity';
import { AutomacaoExecucao } from './automacoes/entities/automacao-execucao.entity';
import { Integracao } from './integracoes/entities/integracao.entity';
import { IntegracaoStep } from './integracoes/entities/integracao-step.entity';
import { IntegracaoConexao } from './integracoes/entities/integracao-conexao.entity';
import { IntegracaoExecucao } from './integracoes/entities/integracao-execucao.entity';
import { IntegracaoExecucaoStep } from './integracoes/entities/integracao-execucao-step.entity';
import { RelatorioModelo } from './relatorios/entities/relatorio-modelo.entity';
import { PdfModelo } from './pdf-modelos/entities/pdf-modelo.entity';
import { ProvedorEmail } from './email/entities/provedor-email.entity';
import { EmailEnvio } from './email/entities/email-envio.entity';
import { Permissao } from './permissoes/entities/permissao.entity';
import { Grupo } from './permissoes/entities/grupo.entity';
import { GrupoUsuario } from './permissoes/entities/grupo-usuario.entity';
import { GrupoProcesso } from './permissoes/entities/grupo-processo.entity';
import { GrupoOrganizacaoPermissao } from './permissoes/entities/grupo-organizacao-permissao.entity';
import { GrupoProcessoPermissao } from './permissoes/entities/grupo-processo-permissao.entity';
import { ProcessosModule } from './processos/processos.module';
import { CardsModule } from './cards/cards.module';
import { AutomacoesModule } from './automacoes/automacoes.module';
import { IntegracoesModule } from './integracoes/integracoes.module';
import { IntegracaoTesteModule } from './integracoes-teste/integracoes-teste.module';
import { RelatoriosModule } from './relatorios/relatorios.module';
import { PdfModelosModule } from './pdf-modelos/pdf-modelos.module';
import { SonsModule } from './sons/sons.module';
import { EtiquetasModule } from './etiquetas/etiquetas.module';
import { VencimentosModule } from './vencimentos/vencimentos.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PermissoesModule } from './permissoes/permissoes.module';
import { FormulariosModule } from './formularios/formularios.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME ?? 'flowly',
      password: process.env.DB_PASSWORD ?? 'flowly',
      database: process.env.DB_DATABASE ?? 'flowly',
      entities: [
        Processo,
        Fase,
        FaseTransicao,
        ProcessoConexao,
        Card,
        CardMovimentacao,
        CardAnexo,
        CardComentario,
        CardComentarioAnexo,
        CardEvento,
        CardPdfEmissao,
        CardResponsavel,
        CardEtiqueta,
        CardVencimentoDisparo,
        Etiqueta,
        User,
        Automacao,
        AutomacaoAcao,
        AutomacaoExecucao,
        Integracao,
        IntegracaoStep,
        IntegracaoConexao,
        IntegracaoExecucao,
        IntegracaoExecucaoStep,
        RelatorioModelo,
        PdfModelo,
        ProvedorEmail,
        EmailEnvio,
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
    IntegracoesModule,
    IntegracaoTesteModule,
    RelatoriosModule,
    PdfModelosModule,
    SonsModule,
    EtiquetasModule,
    VencimentosModule,
    UsersModule,
    AuthModule,
    PermissoesModule,
    FormulariosModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
