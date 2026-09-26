import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomacoesModule } from '../automacoes/automacoes.module';
import { IntegracoesModule } from '../integracoes/integracoes.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { EmailModule } from '../email/email.module';
import { PermissoesModule } from '../permissoes/permissoes.module';
import { StorageModule } from '../storage/storage.module';
import { PdfModelosModule } from '../pdf-modelos/pdf-modelos.module';
import { Integracao } from '../integracoes/entities/integracao.entity';
import { Card } from '../cards/entities/card.entity';
import { IntegracaoTesteController } from './integracoes-teste.controller';
import { IntegracaoTesteService } from './integracoes-teste.service';

// Combina AutomacoesModule + IntegracoesModule pra rodar um step isolado de
// verdade (mesmos STEP_EXECUTORS de produção, cascata real incluída) — mesmo
// padrão do GatilhoExecucaoModule: nem AutomacoesModule nem IntegracoesModule
// importam um ao outro, então este módulo (que importa os dois) é quem
// resolve isso sem dependência circular.
@Module({
  imports: [
    TypeOrmModule.forFeature([Integracao, Card]),
    AutomacoesModule,
    IntegracoesModule,
    RealtimeModule,
    EmailModule,
    PermissoesModule,
    StorageModule,
    PdfModelosModule,
  ],
  controllers: [IntegracaoTesteController],
  providers: [IntegracaoTesteService],
})
export class IntegracaoTesteModule {}
