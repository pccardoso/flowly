import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Card } from './card.entity';
import { User } from '../../users/entities/user.entity';
import { PdfModelo } from '../../pdf-modelos/entities/pdf-modelo.entity';
import { CardPdfEmissaoStatus } from '../enums/card-pdf-emissao-status.enum';

// Uma linha por emissão de PDF de um card — é o histórico (CardEvento.
// PDF_EMITIDO só é gravado quando esta linha chega em CONCLUIDO) e o arquivo
// gerado (ver StorageService). A renderização roda em background (fila
// BullMQ, ver CardPdfEmissaoProcessor) — a linha nasce PROCESSANDO e é
// atualizada pelo processor. O PDF é um snapshot imutável: card e modelo
// podem mudar depois, o arquivo já emitido nunca é re-renderizado.
@Entity('card_pdf_emissoes')
export class CardPdfEmissao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Card, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card!: Card;

  @Column({ name: 'card_id' })
  cardId!: string;

  // SET NULL (não CASCADE): remover o modelo não deve apagar o histórico de
  // PDFs já emitidos com ele — só perde o vínculo de navegação pro modelo
  // (o nome já fica preservado em modeloNomeSnapshot).
  @ManyToOne(() => PdfModelo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'pdf_modelo_id' })
  pdfModelo!: PdfModelo | null;

  @Column({ name: 'pdf_modelo_id', type: 'uuid', nullable: true })
  pdfModeloId!: string | null;

  @Column({ name: 'modelo_nome_snapshot' })
  modeloNomeSnapshot!: string;

  @Column({
    type: 'enum',
    enum: CardPdfEmissaoStatus,
    default: CardPdfEmissaoStatus.PROCESSANDO,
  })
  status!: CardPdfEmissaoStatus;

  @Column({ name: 'object_key', type: 'varchar', nullable: true })
  objectKey!: string | null;

  @Column({ name: 'erro_mensagem', type: 'text', nullable: true })
  erroMensagem!: string | null;

  // SET NULL igual CardEvento.usuarioId: apagar o usuário não deve apagar o
  // rastro de que um PDF foi emitido, só a identidade de quem emitiu.
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'gerado_por_id' })
  geradoPor!: User | null;

  @Column({ name: 'gerado_por_id', type: 'uuid', nullable: true })
  geradoPorId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'concluido_em', type: 'timestamptz', nullable: true })
  concluidoEm!: Date | null;
}
