import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

// Autoedição (PATCH /usuarios/me) — só nome e senha, nunca email/
// isSuperAdmin/bloqueado (isso continua exclusivo da rota de admin, PATCH
// /usuarios/:id). Trocar senha exige a senha atual: sem isso, uma sessão
// esquecida aberta viraria troca de senha silenciosa = sequestro de conta.
export class AtualizarMeuPerfilDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @ValidateIf((dto: AtualizarMeuPerfilDto) => dto.novaSenha !== undefined)
  @IsString()
  @IsNotEmpty()
  senhaAtual?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  novaSenha?: string;
}
