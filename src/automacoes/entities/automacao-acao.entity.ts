import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AcaoTipo } from '../enums/acao-tipo.enum';
import { Automacao } from './automacao.entity';

@Entity('automacao_acoes')
export class AutomacaoAcao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Automacao, (automacao) => automacao.acoes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'automacao_id' })
  automacao!: Automacao;

  @Column({ name: 'automacao_id' })
  automacaoId!: string;

  @Column({ type: 'varchar' })
  tipo!: AcaoTipo;

  // Formato depende de tipo. Para ATUALIZAR_CAMPO: { campo: string, valor: unknown }.
  // Para ATUALIZAR_TITULO: { titulo: string }.
  @Column({ type: 'jsonb' })
  config!: Record<string, unknown>;

  // Ordem de execução dentro da mesma automação.
  @Column()
  ordem!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
