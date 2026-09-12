import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { CardAnexosService } from './anexos.service';
import { ComentariosService } from './comentarios.service';
import { Card } from './entities/card.entity';
import { CardMovimentacao } from './entities/card-movimentacao.entity';
import { CardAnexo } from './entities/card-anexo.entity';
import { CardComentario } from './entities/card-comentario.entity';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { FaseTransicao } from '../fases/entities/fase-transicao.entity';
import { AutomacoesModule } from '../automacoes/automacoes.module';
import { AutomacaoExecucao } from '../automacoes/entities/automacao-execucao.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { StorageModule } from '../storage/storage.module';
import { PermissoesModule } from '../permissoes/permissoes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Card,
      CardMovimentacao,
      CardAnexo,
      CardComentario,
      Processo,
      Fase,
      FaseTransicao,
      AutomacaoExecucao,
    ]),
    AutomacoesModule,
    RealtimeModule,
    StorageModule,
    PermissoesModule,
  ],
  controllers: [CardsController],
  providers: [CardsService, CardAnexosService, ComentariosService],
})
export class CardsModule {}
