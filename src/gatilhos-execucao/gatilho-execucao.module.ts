import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AutomacoesModule } from '../automacoes/automacoes.module';
import { IntegracoesModule } from '../integracoes/integracoes.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { EmailModule } from '../email/email.module';
import { GatilhoExecucaoDispatchService } from './gatilho-execucao-dispatch.service';
import { GatilhoExecucaoProcessor } from './gatilho-execucao.processor';
import { FILA_GATILHO_EXECUCAO } from './gatilho-execucao.types';

// Ponto único que executa, em background, a reação de automações/
// integrações a um evento de card (ver PLANO_EXECUCAO_ASSINCRONA.md). Nem
// AutomacoesModule nem IntegracoesModule importam este módulo de volta —
// sem risco de ciclo (CardsModule importa este, este importa os dois
// motores).
@Module({
  imports: [
    BullModule.registerQueue({ name: FILA_GATILHO_EXECUCAO }),
    AutomacoesModule,
    IntegracoesModule,
    RealtimeModule,
    EmailModule,
  ],
  providers: [GatilhoExecucaoDispatchService, GatilhoExecucaoProcessor],
  exports: [GatilhoExecucaoDispatchService],
})
export class GatilhoExecucaoModule {}
