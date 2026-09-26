import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Processo } from '../../processos/entities/processo.entity';
import { Card } from '../../cards/entities/card.entity';
import { FaseTransicao } from './fase-transicao.entity';
import { CampoFormulario } from '../../processos/formulario/campo-formulario.interface';

@Entity('fases')
export class Fase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  nome!: string;

  @Column()
  ordem!: number;

  @Column({ type: 'varchar', length: 7, nullable: true })
  cor!: string | null;

  // Formulário desta fase: usado pra preencher/atualizar campos de um card
  // que já está nela (ver FormulariosService.obterFormularioFase /
  // atualizarCardViaFormularioFase) — não cria card novo, ao contrário de
  // Processo.formularioEntrada. Mesma interface CampoFormulario, mesma
  // ausência de validação de schema no momento da submissão.
  // Fase final: onde o fluxo termina (ex.: Concluído, Cancelado). Um processo
  // pode ter várias. Cards nela deixam de entrar nos contadores gerais do
  // processo (ver ProcessosService.listar) e o front a renderiza sinalizando
  // o fim.
  @Column({ name: 'is_final', type: 'boolean', default: false })
  isFinal!: boolean;

  @Column({ name: 'formulario_fase', type: 'jsonb', default: [] })
  formularioFase!: CampoFormulario[];

  @ManyToOne(() => Processo, (processo) => processo.fases, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'processo_id' })
  processo!: Processo;

  @Column({ name: 'processo_id' })
  processoId!: string;

  @OneToMany(() => Card, (card) => card.faseAtual)
  cards!: Card[];

  @OneToMany(() => FaseTransicao, (transicao) => transicao.faseOrigem)
  transicoesSaida!: FaseTransicao[];

  @OneToMany(() => FaseTransicao, (transicao) => transicao.faseDestino)
  transicoesEntrada!: FaseTransicao[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
