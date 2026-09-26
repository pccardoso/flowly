import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailController } from './email.controller';
import { EmailService, FILA_EMAIL_ENVIO } from './email.service';
import { EmailEnvioProcessor } from './email.processor';
import { ProvedorEmail } from './entities/provedor-email.entity';
import { EmailEnvio } from './entities/email-envio.entity';
import { StorageModule } from '../storage/storage.module';
import { PermissoesModule } from '../permissoes/permissoes.module';

// Não depende de IntegracoesModule/AutomacoesModule (é o inverso:
// IntegracoesModule importa este, pro step EMAIL usar EmailService) — sem
// risco de dependência circular, diferente do par Automacao/Integracao (ver
// cards/gatilho-dispatch.helper.ts).
@Module({
  imports: [
    TypeOrmModule.forFeature([ProvedorEmail, EmailEnvio]),
    BullModule.registerQueue({ name: FILA_EMAIL_ENVIO }),
    StorageModule,
    PermissoesModule,
  ],
  controllers: [EmailController],
  providers: [EmailService, EmailEnvioProcessor],
  exports: [EmailService],
})
export class EmailModule {}
