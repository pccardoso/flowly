import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessosController } from './processos.controller';
import { ProcessosService } from './processos.service';
import { Processo } from './entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { FaseTransicao } from '../fases/entities/fase-transicao.entity';
import { ProcessoConexao } from './entities/processo-conexao.entity';
import { Card } from '../cards/entities/card.entity';
import { StorageModule } from '../storage/storage.module';
import { PermissoesModule } from '../permissoes/permissoes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Processo,
      Fase,
      FaseTransicao,
      ProcessoConexao,
      Card,
    ]),
    StorageModule,
    PermissoesModule,
  ],
  controllers: [ProcessosController],
  providers: [ProcessosService],
})
export class ProcessosModule {}
