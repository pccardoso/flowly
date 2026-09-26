import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

// PATCH parcial: nome/email/senha só sobrescrevem quando enviados. Não dá
// pra alterar isSuperAdmin nem bloqueado por aqui — o primeiro continua
// manual no banco (bootstrap), o segundo tem rota própria (POST
// .../bloquear|desbloquear), porque é uma ação com regra própria (não pode
// bloquear a si mesmo).
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  senha?: string;
}
