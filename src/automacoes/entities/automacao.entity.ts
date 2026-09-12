import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Processo } from '../../processos/entities/processo.entity';
import { GatilhoTipo } from '../enums/gatilho-tipo.enum';
import { AutomacaoAcao } from './automacao-acao.entity';

@Entity('automacoes')
export class Automacao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  nome!: string;

  @Column({ default: true })
  ativo!: boolean;

  @ManyToOne(() => Processo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'processo_id' })
  processo!: Processo;

  @Column({ name: 'processo_id' })
  processoId!: string;

  @Column({ name: 'gatilho_tipo', type: 'varchar' })
  gatilhoTipo!: GatilhoTipo;

  // Formato depende de gatilhoTipo. Para CARD_ENTROU_NA_FASE: { faseId: uuid }.
  @Column({ name: 'gatilho_config', type: 'jsonb' })
  gatilhoConfig!: Record<string, unknown>;

  @OneToMany(() => AutomacaoAcao, (acao) => acao.automacao, { cascade: true })
  acoes!: AutomacaoAcao[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
