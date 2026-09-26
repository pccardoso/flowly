import { TipoProvedorEmail } from './enums/tipo-provedor-email.enum';

export interface PresetProvedorEmail {
  host: string;
  porta: number;
  seguro: boolean;
}

// Usado por EmailService.criarProvedor/atualizarProvedor pra preencher
// host/porta/seguro sozinho quando o usuário escolhe GMAIL/OUTLOOK e não
// informa esses campos — o usuário só precisa entrar com usuario/senha
// (app-password, no caso do Gmail). SMTP_CUSTOM não tem preset: os três
// campos são sempre obrigatórios nesse caso (ver CreateProvedorEmailDto).
export const PRESETS_PROVEDOR_EMAIL: Partial<
  Record<TipoProvedorEmail, PresetProvedorEmail>
> = {
  [TipoProvedorEmail.GMAIL]: {
    host: 'smtp.gmail.com',
    porta: 465,
    seguro: true,
  },
  [TipoProvedorEmail.OUTLOOK]: {
    host: 'smtp.office365.com',
    porta: 587,
    seguro: false,
  },
};
