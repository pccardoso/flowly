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
import { CondicaoOperador } from '../../common/enums/condicao.enum';

export interface ColunaRelatorio {
  // Um dos ids em CAMPOS_RESERVADOS_RELATORIO, ou um campo.id de
  // processo.formularioEntrada (ver relatorio-campo.util.ts).
  campo: string;
  // Cabeçalho customizado; se ausente, o front usa o rótulo padrão do
  // catálogo (GET .../campos-disponiveis).
  rotulo?: string;
}

export interface FiltroRelatorio {
  campo: string;
  operador: CondicaoOperador;
  // Ausente apenas quando operador é VAZIO/PREENCHIDO.
  valor?: unknown;
  // Só usado com operador ENTRE.
  valorFinal?: unknown;
}

// Um modelo salvo de relatório — de um processo só (V1, ver conversa: cruzar
// pai/filho via ProcessoConexao fica pra uma versão futura). `colunas` e
// `filtros` são jsonb porque nunca são consultados isoladamente, só lidos
// inteiros pra montar a query em memória (RelatoriosService.executarConsulta)
// — mesmo padrão de Processo.formularioEntrada e IntegracaoStep.config.
// Todos os filtros de um modelo são combinados com E (todo filtro precisa
// bater pra o card entrar no relatório) — não há suporte a OU em V1.
@Entity('relatorio_modelos')
export class RelatorioModelo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Processo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'processo_id' })
  processo!: Processo;

  @Column({ name: 'processo_id' })
  processoId!: string;

  @Column()
  nome!: string;

  @Column({ type: 'jsonb' })
  colunas!: ColunaRelatorio[];

  @Column({ type: 'jsonb', default: [] })
  filtros!: FiltroRelatorio[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
