import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Catálogo fixo (ver catalogo-permissoes.ts) — seedado no boot, não editável
// via API.
@Entity('permissoes')
export class Permissao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  alias!: string;

  @Column()
  entidade!: string;

  @Column()
  evento!: string;

  @Column({ type: 'text', nullable: true })
  descricao!: string | null;
}
