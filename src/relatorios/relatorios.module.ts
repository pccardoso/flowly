import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosService } from './relatorios.service';
import { RelatorioModelo } from './entities/relatorio-modelo.entity';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { Card } from '../cards/entities/card.entity';
import { PermissoesModule } from '../permissoes/permissoes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RelatorioModelo, Processo, Fase, Card]),
    PermissoesModule,
  ],
  controllers: [RelatoriosController],
  providers: [RelatoriosService],
  exports: [RelatoriosService],
})
export class RelatoriosModule {}
