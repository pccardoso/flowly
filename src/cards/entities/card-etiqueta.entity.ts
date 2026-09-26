import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Card } from './card.entity';
import { Etiqueta } from '../../etiquetas/entities/etiqueta.entity';

// Junção card <-> etiqueta (N:N, mesmo padrão de CardResponsavel). O unique
// garante no banco que a mesma etiqueta nunca fica duplicada no card. Apagar
// a etiqueta ou o card remove os vínculos (CASCADE).
@Entity('card_etiquetas')
@Unique(['cardId', 'etiquetaId'])
export class CardEtiqueta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Card, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card!: Card;

  @Column({ name: 'card_id' })
  cardId!: string;

  @ManyToOne(() => Etiqueta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'etiqueta_id' })
  etiqueta!: Etiqueta;

  @Column({ name: 'etiqueta_id' })
  etiquetaId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
