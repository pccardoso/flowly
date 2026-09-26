import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { TipoProvedorEmail } from '../enums/tipo-provedor-email.enum';

// PATCH parcial: todo campo só sobrescreve quando enviado. `senha` omitida
// mantém a senha cifrada já salva — não dá pra "limpar" a senha por aqui,
// só trocar por outra (ver EmailService.atualizarProvedor).
export class UpdateProvedorEmailDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @IsOptional()
  @IsEnum(TipoProvedorEmail)
  tipo?: TipoProvedorEmail;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  porta?: number;

  @IsOptional()
  @IsBoolean()
  seguro?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  usuario?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  senha?: string;

  @IsOptional()
  @IsString()
  remetenteNome?: string;

  @IsOptional()
  @IsEmail()
  remetentePadrao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
