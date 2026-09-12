import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Fase } from './fase.entity';

// Cada linha é uma aresta do grafo de fases: representa um movimento
// permitido de faseOrigem -> faseDestino. A ausência de uma aresta bloqueia
// o movimento; arestas nos dois sentidos entre duas fases permitem ida e volta.
@Entity('fase_transicoes')
@Unique(['faseOrigemId', 'faseDestinoId'])
export class FaseTransicao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Fase, (fase) => fase.transicoesSaida, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'fase_origem_id' })
  faseOrigem!: Fase;

  @Column({ name: 'fase_origem_id' })
  faseOrigemId!: string;

  @ManyToOne(() => Fase, (fase) => fase.transicoesEntrada, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'fase_destino_id' })
  faseDestino!: Fase;

  @Column({ name: 'fase_destino_id' })
  faseDestinoId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
