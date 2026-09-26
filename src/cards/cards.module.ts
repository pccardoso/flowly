import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { CardAnexosService } from './anexos.service';
import { ComentariosService } from './comentarios.service';
import { CardResponsaveisService } from './card-responsaveis.service';
import { CardEtiquetasService } from './card-etiquetas.service';
import { CardsBuscaService } from './cards-busca.service';
import { CardEtiqueta } from './entities/card-etiqueta.entity';
import { Etiqueta } from '../etiquetas/entities/etiqueta.entity';
import { Card } from './entities/card.entity';
import { CardMovimentacao } from './entities/card-movimentacao.entity';
import { CardAnexo } from './entities/card-anexo.entity';
import { CardComentario } from './entities/card-comentario.entity';
import { CardComentarioAnexo } from './entities/card-comentario-anexo.entity';
import { CardEvento } from './entities/card-evento.entity';
import { CardResponsavel } from './entities/card-responsavel.entity';
import { User } from '../users/entities/user.entity';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { FaseTransicao } from '../fases/entities/fase-transicao.entity';
import { AutomacoesModule } from '../automacoes/automacoes.module';
import { AutomacaoExecucao } from '../automacoes/entities/automacao-execucao.entity';
import { IntegracoesModule } from '../integracoes/integracoes.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StorageModule } from '../storage/storage.module';
import { PermissoesModule } from '../permissoes/permissoes.module';
import { EmailModule } from '../email/email.module';
import { GatilhoExecucaoModule } from '../gatilhos-execucao/gatilho-execucao.module';
import { PdfModelosModule } from '../pdf-modelos/pdf-modelos.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Card,
      CardMovimentacao,
      CardAnexo,
      CardComentario,
      CardComentarioAnexo,
      CardEvento,
      CardResponsavel,
      CardEtiqueta,
      Etiqueta,
      User,
      Processo,
      Fase,
      FaseTransicao,
      AutomacaoExecucao,
    ]),
    AutomacoesModule,
    IntegracoesModule,
    RealtimeModule,
    StorageModule,
    PermissoesModule,
    EmailModule,
    GatilhoExecucaoModule,
    PdfModelosModule,
  ],
  controllers: [CardsController],
  providers: [
    CardsService,
    CardAnexosService,
    ComentariosService,
    CardResponsaveisService,
    CardEtiquetasService,
    CardsBuscaService,
  ],
  exports: [CardsService, CardAnexosService],
})
export class CardsModule {}
