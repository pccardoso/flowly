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
import { User } from '../../users/entities/user.entity';

// Associa um usuário como responsável de um card — um card pode ter vários
// (mesmo padrão de junção do GrupoUsuario). Por enquanto sem checagem extra
// de "usuário A não pode alterar o card do usuário B" (ver conversa): a
// rota de atualização só exige card.editar, igual qualquer outra mutação de
// card — não existe uma trava dona-do-card ainda.
@Entity('card_responsaveis')
@Unique(['cardId', 'usuarioId'])
export class CardResponsavel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Card, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card!: Card;

  @Column({ name: 'card_id' })
  cardId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: User;

  @Column({ name: 'usuario_id' })
  usuarioId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
