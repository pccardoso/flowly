import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { FILA_VENCIMENTO_VARREDURA } from './vencimentos.types';
import { VencimentosVarreduraService } from './vencimentos-varredura.service';

@Processor(FILA_VENCIMENTO_VARREDURA)
export class VencimentosVarreduraProcessor extends WorkerHost {
  private readonly logger = new Logger(VencimentosVarreduraProcessor.name);

  constructor(private readonly varreduraService: VencimentosVarreduraService) {
    super();
  }

  async process(): Promise<void> {
    try {
      await this.varreduraService.varrer();
    } catch (erro) {
      // Não relança: a próxima rodada (1 min) tenta de novo.
      this.logger.error(
        `Varredura de vencimentos falhou: ${(erro as Error).message}`,
      );
    }
  }
}
