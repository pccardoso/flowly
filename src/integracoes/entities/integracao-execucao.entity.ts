import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Card } from '../../cards/entities/card.entity';
import { StatusExecucao } from '../../automacoes/enums/status-execucao.enum';
import { StepTipo } from '../enums/step-tipo.enum';
import { Integracao } from './integracao.entity';
import { IntegracaoExecucaoStep } from './integracao-execucao-step.entity';

// Log de auditoria de UMA execução do grafo inteiro (um disparo de gatilho).
// Grava dentro da MESMA transação da operação que disparou o gatilho — igual
// a AutomacaoExecucao, inclusive a mesma limitação: se a cadeia falhar e a
// transação for desfeita, esta linha (e os IntegracaoExecucaoStep dela) some
// junto. Só execuções que comitam ficam visíveis no histórico.
@Entity('integracao_execucoes')
export class IntegracaoExecucao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Integracao, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'integracao_id' })
  integracao!: Integracao | null;

  @Column({ name: 'integracao_id', nullable: true })
  integracaoId!: string | null;

  @ManyToOne(() => Card, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card!: Card;

  @Column({ name: 'card_id' })
  cardId!: string;

  @Column({ name: 'gatilho_tipo', type: 'varchar' })
  gatilhoTipo!: StepTipo;

  @Column({ type: 'varchar' })
  status!: StatusExecucao;

  @Column({ type: 'jsonb', nullable: true })
  detalhe!: Record<string, unknown> | null;

  @OneToMany(() => IntegracaoExecucaoStep, (step) => step.execucao, {
    cascade: true,
  })
  steps!: IntegracaoExecucaoStep[];

  @CreateDateColumn({ name: 'executado_em' })
  executadoEm!: Date;
}
