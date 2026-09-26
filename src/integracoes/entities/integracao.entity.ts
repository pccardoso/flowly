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
import { IntegracaoStep } from './integracao-step.entity';
import { IntegracaoConexao } from './integracao-conexao.entity';

// Uma integração é um grafo de steps (ver IntegracaoStep/IntegracaoConexao)
// pertencente a um processo. Paralela e independente do motor de Automacao
// (enum fixo) — os dois convivem, nenhum migra pro outro.
@Entity('integracoes')
export class Integracao {
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

  @OneToMany(() => IntegracaoStep, (step) => step.integracao, {
    cascade: true,
  })
  steps!: IntegracaoStep[];

  @OneToMany(() => IntegracaoConexao, (conexao) => conexao.integracao, {
    cascade: true,
  })
  conexoes!: IntegracaoConexao[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
