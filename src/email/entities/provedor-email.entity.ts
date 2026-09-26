import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TipoProvedorEmail } from '../enums/tipo-provedor-email.enum';

// Configuração de organização (global — não há entity Organizacao neste
// app, então isto vale pra aplicação inteira) de uma conta usada pra enviar
// email a partir de um step EMAIL (ver src/integracoes). GMAIL/OUTLOOK são
// SMTP com host/porta pré-preenchidos (ver email-provider-presets.ts);
// SMTP_CUSTOM exige os três campos explícitos pra qualquer outro provedor.
@Entity('provedores_email')
export class ProvedorEmail {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  nome!: string;

  @Column({ type: 'varchar' })
  tipo!: TipoProvedorEmail;

  @Column()
  host!: string;

  @Column()
  porta!: number;

  // true = TLS implícito (ex.: porta 465), false = STARTTLS (ex.: porta 587).
  @Column({ default: false })
  seguro!: boolean;

  @Column()
  usuario!: string;

  // Cifrada em repouso (ver common/crypto.util.ts) — select:false pra nunca
  // vir em nenhum find() por padrão, mesmo padrão de User.senhaHash. Só
  // EmailService.processarEnvio pede explicitamente (select: {senhaCifrada:
  // true}) pra montar o transporter SMTP.
  @Column({ name: 'senha_cifrada', select: false })
  senhaCifrada!: string;

  @Column({ name: 'remetente_nome', type: 'varchar', nullable: true })
  remetenteNome!: string | null;

  @Column({ name: 'remetente_padrao' })
  remetentePadrao!: string;

  @Column({ default: true })
  ativo!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
