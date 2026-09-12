import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  nome!: string;

  @Column({ unique: true })
  email!: string;

  // Hash bcrypt — nunca expor em resposta de API (ver UsersService.paraResposta).
  @Column({ name: 'senha_hash' })
  senhaHash!: string;

  // Ignora toda checagem de PermissoesGuard — existe só pra bootstrap (o
  // primeiro usuário precisa conseguir cadastrar grupos/permissões antes de
  // ter qualquer grupo/permissão concedida a ele mesmo).
  @Column({ name: 'is_super_admin', default: false })
  isSuperAdmin!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
