import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegracoesController } from './integracoes.controller';
import { IntegracoesService } from './integracoes.service';
import { Integracao } from './entities/integracao.entity';
import { IntegracaoStep } from './entities/integracao-step.entity';
import { IntegracaoConexao } from './entities/integracao-conexao.entity';
import { IntegracaoExecucao } from './entities/integracao-execucao.entity';
import { IntegracaoExecucaoStep } from './entities/integracao-execucao-step.entity';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { ProcessoConexao } from '../processos/entities/processo-conexao.entity';
import { User } from '../users/entities/user.entity';
import { PermissoesModule } from '../permissoes/permissoes.module';
import { EmailModule } from '../email/email.module';
import { StorageModule } from '../storage/storage.module';
import { PdfModelosModule } from '../pdf-modelos/pdf-modelos.module';
import { PdfModelo } from '../pdf-modelos/entities/pdf-modelo.entity';
import { Etiqueta } from '../etiquetas/entities/etiqueta.entity';

// Paralelo e independente de AutomacoesModule — nenhum dos dois módulos
// importa o outro (ver cards/gatilho-dispatch.helper.ts para como os dois
// motores conversam sem dependência circular).
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Integracao,
      IntegracaoStep,
      IntegracaoConexao,
      IntegracaoExecucao,
      IntegracaoExecucaoStep,
      Processo,
      Fase,
      ProcessoConexao,
      User,
      PdfModelo,
      Etiqueta,
    ]),
    PermissoesModule,
    EmailModule,
    StorageModule,
    PdfModelosModule,
  ],
  controllers: [IntegracoesController],
  providers: [IntegracoesService],
  exports: [IntegracoesService],
})
export class IntegracoesModule {}
