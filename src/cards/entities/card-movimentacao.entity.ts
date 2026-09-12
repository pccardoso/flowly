import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Fase } from '../../fases/entities/fase.entity';
import { Card } from './card.entity';

// Histórico de movimentações do card entre fases, usado para auditoria
// e para reconstruir o caminho percorrido dentro do Processo.
@Entity('card_movimentacoes')
export class CardMovimentacao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Card, (card) => card.movimentacoes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'card_id' })
  card!: Card;

  @Column({ name: 'card_id' })
  cardId!: string;

  // Nula na movimentação inicial, quando o card é criado direto na fase.
  @ManyToOne(() => Fase, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fase_origem_id' })
  faseOrigem!: Fase | null;

  @Column({ name: 'fase_origem_id', nullable: true })
  faseOrigemId!: string | null;

  @ManyToOne(() => Fase, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fase_destino_id' })
  faseDestino!: Fase;

  @Column({ name: 'fase_destino_id' })
  faseDestinoId!: string;

  @CreateDateColumn({ name: 'movido_em' })
  movidoEm!: Date;
}
