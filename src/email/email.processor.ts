import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailService, FILA_EMAIL_ENVIO } from './email.service';

// Worker BullMQ que roda fora da transação/resposta HTTP que enfileirou o
// envio (ver EmailService.despacharEnvios) — é aqui que o handshake SMTP de
// verdade acontece, sem travar o usuário.
@Processor(FILA_EMAIL_ENVIO)
export class EmailEnvioProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailEnvioProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<{ envioId: string }>): Promise<void> {
    try {
      await this.emailService.processarEnvio(job.data.envioId);
    } catch (erro) {
      this.logger.warn(
        `Falha ao enviar email (envioId=${job.data.envioId}, tentativa=${job.attemptsMade + 1}): ${(erro as Error).message}`,
      );
      throw erro;
    }
  }
}
