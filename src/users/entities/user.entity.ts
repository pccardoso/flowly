import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  nome!: string;

  @Column({ unique: true })
  email!: string;

  // Hash bcrypt — nunca expor em resposta de API (ver UsersService.paraResposta).
  // select:false: qualquer relation que carregue User (ex.: CardComentario.
  // usuario, CardEvento.usuario) fica automaticamente sem esse campo, sem
  // precisar de sanitização manual em cada ponto — só quem pedir
  // explicitamente (UsersService.buscarPorEmail, pro login) recebe.
  @Column({ name: 'senha_hash', select: false })
  senhaHash!: string;

  // Ignora toda checagem de PermissoesGuard — existe só pra bootstrap (o
  // primeiro usuário precisa conseguir cadastrar grupos/permissões antes de
  // ter qualquer grupo/permissão concedida a ele mesmo).
  @Column({ name: 'is_super_admin', default: false })
  isSuperAdmin!: boolean;

  // Bloqueio é a única forma de "remover" um usuário (ver UsersService) —
  // não há hard delete. Um usuário bloqueado não consegue logar
  // (AuthService.login), perde a sessão em qualquer request já autenticado
  // (JwtAuthGuard checa isso a cada request, não só no login) e nunca passa
  // em nenhuma checagem de permissão, mesmo isSuperAdmin (PermissoesService.
  // usuarioTemPermissao) — inclusive como conta de serviço de um step de
  // Integração (IntegracoesService.verificarPermissaoServico). Também some
  // do diretório usado pra montar grupo/conta de serviço (UsersService.
  // listar), mas continua membro de grupos que já tinham ele — bloquear não
  // desfaz vínculo, só invalida a permissão em runtime.
  @Column({ default: false })
  bloqueado!: boolean;

  // Caminho do objeto no bucket MinIO — nunca exposto direto na API, só via
  // GET /usuarios/:id/avatar (mesmo padrão de Processo.imagemObjectKey).
  @Column({ name: 'avatar_object_key', type: 'varchar', nullable: true })
  avatarObjectKey!: string | null;

  @Column({ name: 'avatar_mime_type', type: 'varchar', nullable: true })
  avatarMimeType!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
