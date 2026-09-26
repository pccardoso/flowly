import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StatusExecucao } from '../../automacoes/enums/status-execucao.enum';
import { StepTipo } from '../enums/step-tipo.enum';
import { IntegracaoExecucao } from './integracao-execucao.entity';
import { IntegracaoStep } from './integracao-step.entity';

// Uma linha por step efetivamente rodado dentro de uma IntegracaoExecucao —
// é o que permite ao usuário ver, step a step, onde uma execução falhou.
@Entity('integracao_execucao_steps')
export class IntegracaoExecucaoStep {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => IntegracaoExecucao, (execucao) => execucao.steps, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'execucao_id' })
  execucao!: IntegracaoExecucao;

  @Column({ name: 'execucao_id' })
  execucaoId!: string;

  // Snapshot do step (nunca deletado em cascata pro step original ser
  // removido/renomeado sem afetar o histórico já gravado).
  @ManyToOne(() => IntegracaoStep, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'step_id' })
  step!: IntegracaoStep | null;

  @Column({ name: 'step_id', nullable: true })
  stepId!: string | null;

  @Column({ name: 'step_apelido' })
  stepApelido!: string;

  @Column({ type: 'varchar' })
  tipo!: StepTipo;

  @Column({ type: 'varchar' })
  status!: StatusExecucao;

  @Column({ type: 'jsonb', nullable: true })
  entrada!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  saida!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  erro!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'executado_em' })
  executadoEm!: Date;
}
