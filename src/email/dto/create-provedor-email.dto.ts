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

export class CreateProvedorEmailDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsEnum(TipoProvedorEmail)
  tipo!: TipoProvedorEmail;

  // Obrigatórios só pra SMTP_CUSTOM — em GMAIL/OUTLOOK, quando omitidos, são
  // preenchidos a partir do preset (ver EmailService.criar/atualizarProvedor
  // e email-provider-presets.ts).
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

  @IsString()
  @IsNotEmpty()
  usuario!: string;

  @IsString()
  @IsNotEmpty()
  senha!: string;

  @IsOptional()
  @IsString()
  remetenteNome?: string;

  // Default: mesmo valor de `usuario`, se omitido (ver EmailService).
  @IsOptional()
  @IsEmail()
  remetentePadrao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
