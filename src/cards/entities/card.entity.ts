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
import { Fase } from '../../fases/entities/fase.entity';
import { CardMovimentacao } from './card-movimentacao.entity';
import { CardAnexo } from './card-anexo.entity';
import { CardComentario } from './card-comentario.entity';

@Entity('cards')
export class Card {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  titulo!: string;

  // Campos livres do card (chave/valor), alvo da automação ATUALIZAR_CAMPO.
  @Column({ type: 'jsonb', default: {} })
  campos!: Record<string, unknown>;

  // Cards filhos criados via ProcessoConexao. Índice = posicao da conexão
  // (fixa por processo, nunca reaproveitada mesmo se a conexão for
  // removida). null = ainda não há filho criado para aquela posição.
  @Column({ type: 'jsonb', default: [] })
  filhos!: (string | null)[];

  // Preenchidos quando este card foi criado como filho de outro através de
  // uma ProcessoConexao (ver AutomacoesService/CardsService.criarFilho).
  @Column({ name: 'pai_card_id', type: 'uuid', nullable: true })
  paiCardId!: string | null;

  @Column({ name: 'pai_conexao_id', type: 'uuid', nullable: true })
  paiConexaoId!: string | null;

  @ManyToOne(() => Processo, (processo) => processo.cards, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'processo_id' })
  processo!: Processo;

  @Column({ name: 'processo_id' })
  processoId!: string;

  @ManyToOne(() => Fase, (fase) => fase.cards, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fase_atual_id' })
  faseAtual!: Fase;

  @Column({ name: 'fase_atual_id' })
  faseAtualId!: string;

  @OneToMany(() => CardMovimentacao, (movimentacao) => movimentacao.card)
  movimentacoes!: CardMovimentacao[];

  @OneToMany(() => CardAnexo, (anexo) => anexo.card)
  anexos!: CardAnexo[];

  @OneToMany(() => CardComentario, (comentario) => comentario.card)
  comentarios!: CardComentario[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
