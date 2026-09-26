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

export enum VencimentoDisparoTipo {
  VENCIDO = 'VENCIDO',
  PRESTES_A_VENCER = 'PRESTES_A_VENCER',
}

// Registro de "este gatilho de vencimento já foi disparado pra este card
// NESTA data de vencimento". O unique é o que garante disparo único mesmo com
// várias instâncias varrendo ao mesmo tempo; como a data faz parte da chave,
// adiar o vencimento permite disparar de novo na data nova.
@Entity('card_vencimento_disparos')
@Unique(['cardId', 'tipo', 'dataVencimento'])
export class CardVencimentoDisparo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Card, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card!: Card;

  @Column({ name: 'card_id' })
  cardId!: string;

  @Column({ type: 'varchar' })
  tipo!: VencimentoDisparoTipo;

  @Column({ name: 'data_vencimento', type: 'timestamptz' })
  dataVencimento!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
