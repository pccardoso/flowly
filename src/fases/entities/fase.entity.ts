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
import { Card } from '../../cards/entities/card.entity';
import { FaseTransicao } from './fase-transicao.entity';

@Entity('fases')
export class Fase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  nome!: string;

  @Column()
  ordem!: number;

  @Column({ type: 'varchar', length: 7, nullable: true })
  cor!: string | null;

  @ManyToOne(() => Processo, (processo) => processo.fases, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'processo_id' })
  processo!: Processo;

  @Column({ name: 'processo_id' })
  processoId!: string;

  @OneToMany(() => Card, (card) => card.faseAtual)
  cards!: Card[];

  @OneToMany(() => FaseTransicao, (transicao) => transicao.faseOrigem)
  transicoesSaida!: FaseTransicao[];

  @OneToMany(() => FaseTransicao, (transicao) => transicao.faseDestino)
  transicoesEntrada!: FaseTransicao[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
