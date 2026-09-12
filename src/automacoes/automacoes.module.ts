import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomacoesController } from './automacoes.controller';
import { AutomacoesService } from './automacoes.service';
import { Automacao } from './entities/automacao.entity';
import { AutomacaoAcao } from './entities/automacao-acao.entity';
import { AutomacaoExecucao } from './entities/automacao-execucao.entity';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { ProcessoConexao } from '../processos/entities/processo-conexao.entity';
import { PermissoesModule } from '../permissoes/permissoes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Automacao,
      AutomacaoAcao,
      AutomacaoExecucao,
      Processo,
      Fase,
      ProcessoConexao,
    ]),
    PermissoesModule,
  ],
  controllers: [AutomacoesController],
  providers: [AutomacoesService],
  exports: [AutomacoesService],
})
export class AutomacoesModule {}
