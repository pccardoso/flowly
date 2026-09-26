import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { PdfModelosController } from './pdf-modelos.controller';
import { PdfModelosService } from './pdf-modelos.service';
import { PdfRendererService } from './pdf-renderer.service';
import { CardPdfEmissaoService } from './card-pdf-emissao.service';
import { CardPdfEmissaoProcessor } from './card-pdf-emissao.processor';
import { PdfModelo } from './entities/pdf-modelo.entity';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { Card } from '../cards/entities/card.entity';
import { CardPdfEmissao } from '../cards/entities/card-pdf-emissao.entity';
import { StorageModule } from '../storage/storage.module';
import { PermissoesModule } from '../permissoes/permissoes.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { FILA_PDF_EMISSAO } from './card-pdf-emissao.types';

// Não importa CardsModule (evita dependência circular — mesmo motivo do par
// Automacao/Integracao, ver CLAUDE.md): usa os repositórios de Card/Fase
// direto via TypeOrmModule.forFeature. CardsModule é quem importa este
// módulo (pra CardsController usar CardPdfEmissaoService), nunca o inverso.
@Module({
  imports: [
    TypeOrmModule.forFeature([PdfModelo, CardPdfEmissao, Processo, Fase, Card]),
    BullModule.registerQueue({ name: FILA_PDF_EMISSAO }),
    StorageModule,
    PermissoesModule,
    RealtimeModule,
  ],
  controllers: [PdfModelosController],
  providers: [
    PdfModelosService,
    PdfRendererService,
    CardPdfEmissaoService,
    CardPdfEmissaoProcessor,
  ],
  exports: [CardPdfEmissaoService],
})
export class PdfModelosModule {}
