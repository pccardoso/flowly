import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { CardAnexo } from './card-anexo.entity';
import { CardComentario } from './card-comentario.entity';

// Vínculo comentário → anexo. O arquivo vive em `card_anexos` (é o anexo
// "principal" do card); o comentário só o referencia. Os dois lados usam
// CASCADE: remover o comentário só apaga o vínculo (o anexo permanece no
// card), e remover o anexo do card faz ele sumir do comentário.
@Entity('card_comentario_anexos')
export class CardComentarioAnexo {
  @PrimaryColumn({ name: 'comentario_id' })
  comentarioId!: string;

  @PrimaryColumn({ name: 'anexo_id' })
  anexoId!: string;

  @ManyToOne(() => CardComentario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comentario_id' })
  comentario!: CardComentario;

  @ManyToOne(() => CardAnexo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'anexo_id' })
  anexo!: CardAnexo;
}
