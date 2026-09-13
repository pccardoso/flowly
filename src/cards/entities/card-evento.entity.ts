import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Card } from './card.entity';
import { User } from '../../users/entities/user.entity';
import { CardEventoTipo } from '../enums/card-evento-tipo.enum';

// Histórico completo do card (ver CLAUDE.md/conversa): uma linha por evento
// sofrido pelo card, com `tipo` fixo pra filtro e `dadosAntes`/`dadosDepois`
// cujo formato varia por tipo (ver card-evento.helper.ts). onDelete: CASCADE
// no card — decisão deliberada de manter o mesmo padrão do resto do projeto
// (CardMovimentacao/CardAnexo/CardComentario também somem com o card), então
// não existe um evento "CARD_REMOVIDO" sobrevivente: ele desapareceria na
// mesma transação que o gerou.
@Entity('card_eventos')
export class CardEvento {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Card, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card!: Card;

  @Column({ name: 'card_id' })
  cardId!: string;

  @Column({ type: 'enum', enum: CardEventoTipo })
  tipo!: CardEventoTipo;

  // null = evento sem usuário identificável: efeito em cascata de automação
  // (ver `automatico`) ou submissão de formulário externo público sem login.
  // onDelete: SET NULL (diferente do resto do projeto) — apagar o usuário
  // não deve apagar o rastro do que ele fez, só a identidade do autor.
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: User | null;

  @Column({ name: 'usuario_id', nullable: true })
  usuarioId!: string | null;

  // true = efeito colateral de uma automação (cascata), não uma ação direta
  // de alguém — mesmo quando usuarioId não é null (ex.: pode não ocorrer
  // hoje, mas mantém o dado auto-explicativo sem depender só de usuarioId).
  @Column({ default: false })
  automatico!: boolean;

  @Column({ name: 'dados_antes', type: 'jsonb', nullable: true })
  dadosAntes!: Record<string, unknown> | null;

  @Column({ name: 'dados_depois', type: 'jsonb', nullable: true })
  dadosDepois!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
