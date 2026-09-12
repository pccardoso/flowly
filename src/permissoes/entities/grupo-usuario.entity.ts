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
import { User } from '../../users/entities/user.entity';

// Associa um Usuário a um Grupo (é assim que o usuário herda permissões —
// não existe permissão individual, ver permissions.md seção 1).
@Entity('grupo_usuarios')
@Unique(['grupoId', 'usuarioId'])
export class GrupoUsuario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Grupo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'grupo_id' })
  grupo!: Grupo;

  @Column({ name: 'grupo_id' })
  grupoId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: User;

  @Column({ name: 'usuario_id' })
  usuarioId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
