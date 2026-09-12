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
import { Permissao } from './permissao.entity';

// Permissão de Processo de um grupo: quando existe QUALQUER linha aqui pra
// (grupo, processo), ela passa a ser a ÚNICA fonte de permissão do grupo
// NESSE processo — a permissão de Organização do grupo deixa de valer ali
// (override total, não é união). Ver PermissoesService.usuarioTemPermissao.
@Entity('grupo_processo_permissoes')
@Unique(['grupoId', 'processoId', 'permissaoId'])
export class GrupoProcessoPermissao {
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

  @ManyToOne(() => Permissao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permissao_id' })
  permissao!: Permissao;

  @Column({ name: 'permissao_id' })
  permissaoId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
