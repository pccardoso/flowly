import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Processo } from '../../processos/entities/processo.entity';

// Etiqueta de um processo: nome + cor (#RRGGBB). Cada processo tem o seu
// próprio conjunto — o nome é único dentro do processo (comparado sem
// diferenciar maiúscula/minúscula no service). Um card só pode receber
// etiquetas do próprio processo (ver CardEtiquetasService).
@Entity('etiquetas')
@Unique(['processoId', 'nome'])
export class Etiqueta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Processo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'processo_id' })
  processo!: Processo;

  @Column({ name: 'processo_id' })
  processoId!: string;

  @Column()
  nome!: string;

  @Column({ length: 7 })
  cor!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
