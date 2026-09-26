import { IsOptional, IsString } from 'class-validator';

// usuarioId não vem mais daqui — é sempre o usuário autenticado
// (@CurrentUser() no controller), pra impedir que o client atribua o
// comentário a outra pessoa.
//
// `texto` é opcional porque um comentário pode ser só anexo(s); a regra
// "texto ou pelo menos 1 anexo" é conferida no ComentariosService (o DTO
// não enxerga os arquivos do multipart).
export class CreateComentarioDto {
  @IsOptional()
  @IsString()
  texto?: string;
}
