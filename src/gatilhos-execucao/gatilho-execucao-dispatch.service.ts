import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  FILA_GATILHO_EXECUCAO,
  GatilhoExecucaoJobPayload,
} from './gatilho-execucao.types';

// Chamado só depois que a transação do save do usuário (CardsService) já
// comitou — enfileira a reação de automações/integrações fora da transação e
// da resposta HTTP, pra o save nunca esperar nem ser desfeito por um step
// mal configurado (ver PLANO_EXECUCAO_ASSINCRONA.md). Sem retry automático
// (attempts: 1): reprocessar um job que já rodou parte dos efeitos
// colaterais (ex.: já criou um card filho antes de falhar num step
// seguinte) duplicaria esses efeitos.
@Injectable()
export class GatilhoExecucaoDispatchService {
  constructor(
    @InjectQueue(FILA_GATILHO_EXECUCAO)
    private readonly fila: Queue<GatilhoExecucaoJobPayload>,
  ) {}

  async enfileirar(jobs: GatilhoExecucaoJobPayload[]): Promise<void> {
    await Promise.all(
      jobs.map((job) =>
        this.fila.add('executar', job, {
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: 100,
        }),
      ),
    );
  }
}
