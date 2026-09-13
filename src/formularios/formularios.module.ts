import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormulariosController } from './formularios.controller';
import { FormulariosService } from './formularios.service';
import { FormularioExternoGuard } from './guards/formulario-externo.guard';
import { Processo } from '../processos/entities/processo.entity';
import { Fase } from '../fases/entities/fase.entity';
import { Card } from '../cards/entities/card.entity';
import { CardsModule } from '../cards/cards.module';

@Module({
  imports: [TypeOrmModule.forFeature([Processo, Fase, Card]), CardsModule],
  controllers: [FormulariosController],
  providers: [FormulariosService, FormularioExternoGuard],
})
export class FormulariosModule {}
