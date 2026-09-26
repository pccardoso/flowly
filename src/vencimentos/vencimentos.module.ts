import { Injectable, Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GatilhoExecucaoModule } from '../gatilhos-execucao/gatilho-execucao.module';
import { VencimentosVarreduraProcessor } from './vencimentos-varredura.processor';
import { VencimentosVarreduraService } from './vencimentos-varredura.service';
import {
  FILA_VENCIMENTO_VARREDURA,
  INTERVALO_VARREDURA_MS,
} from './vencimentos.types';

// Registra o job repetível (a cada 1 min). upsertJobScheduler é idempotente:
// subir várias instâncias da aplicação não duplica o agendamento.
@Injectable()
class VencimentosAgendador implements OnModuleInit {
  constructor(
    @InjectQueue(FILA_VENCIMENTO_VARREDURA) private readonly fila: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.fila.upsertJobScheduler(
      'varredura-vencimentos',
      { every: INTERVALO_VARREDURA_MS },
      {
        name: 'varrer',
        opts: { removeOnComplete: true, removeOnFail: 20, attempts: 1 },
      },
    );
  }
}

@Module({
  imports: [
    BullModule.registerQueue({ name: FILA_VENCIMENTO_VARREDURA }),
    GatilhoExecucaoModule,
  ],
  providers: [
    VencimentosVarreduraService,
    VencimentosVarreduraProcessor,
    VencimentosAgendador,
  ],
})
export class VencimentosModule {}
