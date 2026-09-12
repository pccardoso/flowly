import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Card } from '../../cards/entities/card.entity';
import { GatilhoTipo } from '../enums/gatilho-tipo.enum';
import { StatusExecucao } from '../enums/status-execucao.enum';
import { Automacao } from './automacao.entity';

// Log de auditoria: uma linha por tentativa de execução de automação
// disparada por um evento de card. Sobrevive à exclusão da automação
// (fase_id vira nulo) para preservar o histórico.
@Entity('automacao_execucoes')
export class AutomacaoExecucao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Automacao, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'automacao_id' })
  automacao!: Automacao | null;

  @Column({ name: 'automacao_id', nullable: true })
  automacaoId!: string | null;

  @ManyToOne(() => Card, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card!: Card;

  @Column({ name: 'card_id' })
  cardId!: string;

  @Column({ name: 'gatilho_tipo', type: 'varchar' })
  gatilhoTipo!: GatilhoTipo;

  @Column({ type: 'varchar' })
  status!: StatusExecucao;

  @Column({ type: 'jsonb', nullable: true })
  detalhe!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'executado_em' })
  executadoEm!: Date;
}
