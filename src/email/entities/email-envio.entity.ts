import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Card } from '../../cards/entities/card.entity';
import { ProvedorEmail } from './provedor-email.entity';
import { StatusEmailEnvio } from '../enums/status-email-envio.enum';

export interface AnexoEmailEnvio {
  nome: string;
  objectKey: string;
  mimeType: string;
}

// Linha de outbox/auditoria de UM envio de email disparado por um step EMAIL
// (ver src/integracoes). Criada dentro da MESMA transação do card que
// disparou o step (status PENDENTE) — o envio de verdade acontece depois,
// numa fila (BullMQ), fora da transação, pra não segurar conexão de banco
// nem a resposta HTTP esperando o handshake SMTP (ver conversa/CLAUDE.md:
// EmailService.enfileirarEnvio/despacharEnvios/processarEnvio).
//
// Step EMAIL é terminal no grafo de integração (STEP_TIPOS_TERMINAL) — o
// resultado real do envio (campos `status`/`resposta`/`erro` abaixo) só fica
// disponível aqui, em auditoria; nenhum step a jusante consegue encadear a
// partir dele na mesma execução.
@Entity('email_envios')
export class EmailEnvio {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ProvedorEmail, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'provedor_id' })
  provedor!: ProvedorEmail | null;

  @Column({ name: 'provedor_id', type: 'uuid', nullable: true })
  provedorId!: string | null;

  // Card que disparou o step — sobrevive à remoção do card (SET NULL) pra
  // preservar o histórico de envio mesmo depois que o card some.
  @ManyToOne(() => Card, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'card_id' })
  card!: Card | null;

  @Column({ name: 'card_id', type: 'uuid', nullable: true })
  cardId!: string | null;

  // Rastreabilidade só (não é FK — a integração/step podem ser editados ou
  // removidos sem afetar este histórico).
  @Column({ name: 'integracao_id', type: 'uuid', nullable: true })
  integracaoId!: string | null;

  @Column({ name: 'step_apelido', type: 'varchar', nullable: true })
  stepApelido!: string | null;

  @Column({ type: 'jsonb' })
  destinatarios!: string[];

  @Column({ type: 'jsonb', default: [] })
  cc!: string[];

  @Column()
  assunto!: string;

  @Column({ name: 'corpo_html', type: 'text' })
  corpoHtml!: string;

  @Column({ type: 'jsonb', default: [] })
  anexos!: AnexoEmailEnvio[];

  @Column({ type: 'varchar', default: StatusEmailEnvio.PENDENTE })
  status!: StatusEmailEnvio;

  @Column({ default: 0 })
  tentativas!: number;

  // Resposta bruta do provedor SMTP na tentativa mais recente (ex.:
  // messageId/accepted/rejected/response do nodemailer) — é isto que o
  // usuário pediu como "saída = response da tentativa de email", só que
  // disponível em auditoria, não encadeável no mesmo grafo (ver comentário
  // acima).
  @Column({ type: 'jsonb', nullable: true })
  resposta!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  erro!: { mensagem: string } | null;

  @CreateDateColumn({ name: 'enfileirado_em' })
  enfileiradoEm!: Date;

  @Column({ name: 'enviado_em', type: 'timestamp', nullable: true })
  enviadoEm!: Date | null;
}
