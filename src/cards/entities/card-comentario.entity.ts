import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Card } from './card.entity';
import { User } from '../../users/entities/user.entity';

@Entity('card_comentarios')
export class CardComentario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Card, (card) => card.comentarios, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card!: Card;

  @Column({ name: 'card_id' })
  cardId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: User;

  @Column({ name: 'usuario_id' })
  usuarioId!: string;

  @Column({ type: 'text' })
  texto!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
