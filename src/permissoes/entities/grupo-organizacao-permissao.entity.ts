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
import { Permissao } from './permissao.entity';

// Permissão de Organização de um grupo: vale em todos os processos, exceto
// onde o grupo tiver override de Processo definido (ver
// PermissoesService.usuarioTemPermissao).
@Entity('grupo_organizacao_permissoes')
@Unique(['grupoId', 'permissaoId'])
export class GrupoOrganizacaoPermissao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Grupo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'grupo_id' })
  grupo!: Grupo;

  @Column({ name: 'grupo_id' })
  grupoId!: string;

  @ManyToOne(() => Permissao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permissao_id' })
  permissao!: Permissao;

  @Column({ name: 'permissao_id' })
  permissaoId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
