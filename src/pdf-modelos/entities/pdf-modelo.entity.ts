import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Processo } from '../../processos/entities/processo.entity';

// Modelo de PDF de um processo: um único HTML livre (com <style> embutido,
// se o usuário quiser CSS — ver PdfRendererService), interpolado na emissão
// com os placeholders de pdf-campo.util.ts (atributos do card + formulário
// de entrada). `ativo` é soft-toggle — não some do histórico de emissões
// antigas (CardPdfEmissao.pdfModeloId sobrevive à desativação), só esconde
// do picker de emissão de novos PDFs no front.
@Entity('pdf_modelos')
export class PdfModelo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Processo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'processo_id' })
  processo!: Processo;

  @Column({ name: 'processo_id' })
  processoId!: string;

  @Column()
  nome!: string;

  @Column({ type: 'text' })
  html!: string;

  @Column({ default: true })
  ativo!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
