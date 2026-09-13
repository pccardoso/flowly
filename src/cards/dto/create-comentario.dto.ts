import { IsNotEmpty, IsString } from 'class-validator';

// usuarioId não vem mais daqui — é sempre o usuário autenticado
// (@CurrentUser() no controller), pra impedir que o client atribua o
// comentário a outra pessoa.
export class CreateComentarioDto {
  @IsString()
  @IsNotEmpty()
  texto!: string;
}
