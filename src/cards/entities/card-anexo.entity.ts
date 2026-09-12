import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Card } from './card.entity';

@Entity('card_anexos')
export class CardAnexo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Card, (card) => card.anexos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card!: Card;

  @Column({ name: 'card_id' })
  cardId!: string;

  @Column({ name: 'nome_original' })
  nomeOriginal!: string;

  // Caminho do objeto dentro do bucket MinIO (não é exposto diretamente ao
  // client; download sempre passa pela rota GET .../anexos/:anexoId).
  @Column({ name: 'object_key' })
  objectKey!: string;

  @Column({ name: 'mime_type' })
  mimeType!: string;

  @Column({
    type: 'bigint',
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  tamanho!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
