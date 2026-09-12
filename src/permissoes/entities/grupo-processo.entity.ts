import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Grupo } from './grupo.entity';
import { Processo } from '../../processos/entities/processo.entity';

// Associa um Processo a um Grupo — é o pré-requisito pra existir permissão
// de Processo pra esse grupo (GrupoProcessoPermissao) nele.
@Entity('grupo_processos')
@Unique(['grupoId', 'processoId'])
export class GrupoProcesso {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Grupo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'grupo_id' })
  grupo!: Grupo;

  @Column({ name: 'grupo_id' })
  grupoId!: string;

  @ManyToOne(() => Processo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'processo_id' })
  processo!: Processo;

  @Column({ name: 'processo_id' })
  processoId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
