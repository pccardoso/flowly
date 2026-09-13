import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Fase } from '../../fases/entities/fase.entity';
import { Card } from '../../cards/entities/card.entity';
import { CampoFormulario } from '../formulario/campo-formulario.interface';

@Entity('processos')
export class Processo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  nome!: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  cor!: string | null;

  @Column({ type: 'text', nullable: true })
  descricao!: string | null;

  // Caminho do objeto no bucket MinIO — nunca exposto direto na API, só via
  // GET /processos/:id/imagem (mesmo padrão dos anexos de card).
  @Column({ name: 'imagem_object_key', type: 'varchar', nullable: true })
  imagemObjectKey!: string | null;

  @Column({ name: 'imagem_mime_type', type: 'varchar', nullable: true })
  imagemMimeType!: string | null;

  // Formulário de entrada: campos que o front pede ao criar um card novo
  // neste processo. Por enquanto só a definição — a criação de card ainda
  // não valida `campos` contra isso.
  @Column({ name: 'formulario_entrada', type: 'jsonb', default: [] })
  formularioEntrada!: CampoFormulario[];

  // ids de campos de `formularioEntrada` que devem aparecer na face do card
  // no kanban (o front decide o layout, o back só guarda quais mostrar).
  @Column({ name: 'campos_exibidos_no_card', type: 'jsonb', default: [] })
  camposExibidosNoCard!: string[];

  // Se definido, o título do card é derivado de `campos[tituloCampoId]`
  // quando o request de criação não manda `titulo` explícito.
  @Column({ name: 'titulo_campo_id', type: 'varchar', nullable: true })
  tituloCampoId!: string | null;

  // Controla o link externo de formulário (ver FormulariosModule): tanto o
  // do formulário de entrada (identificado só pelo processoId) quanto o
  // futuro formulário de fase (processoId + faseId) — um único flag pro
  // processo inteiro, não por fase. true = precisa de JWT válido pra
  // visualizar/enviar; false = totalmente público. Default seguro: exige
  // autenticação até alguém desligar explicitamente.
  @Column({
    name: 'formulario_externo_requer_autenticacao',
    type: 'boolean',
    default: true,
  })
  formularioExternoRequerAutenticacao!: boolean;

  @OneToMany(() => Fase, (fase) => fase.processo)
  fases!: Fase[];

  @OneToMany(() => Card, (card) => card.processo)
  cards!: Card[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
