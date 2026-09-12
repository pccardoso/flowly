import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Processo } from './processo.entity';

// Cada linha é uma aresta do grafo de processos: processoOrigem pode gerar
// cards filhos em processoDestino através desta conexão. `posicao` é fixa
// por processoOrigemId e nunca é reaproveitada — remover uma conexão apenas
// marca `ativo = false`, preservando o índice usado no array `Card.filhos`
// de cards já criados através dela.
@Entity('processo_conexoes')
@Unique(['processoOrigemId', 'posicao'])
export class ProcessoConexao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Processo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'processo_origem_id' })
  processoOrigem!: Processo;

  @Column({ name: 'processo_origem_id' })
  processoOrigemId!: string;

  @ManyToOne(() => Processo, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'processo_destino_id' })
  processoDestino!: Processo;

  @Column({ name: 'processo_destino_id' })
  processoDestinoId!: string;

  @Column()
  posicao!: number;

  @Column({ default: true })
  ativo!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
