// GMAIL/OUTLOOK só preenchem host/porta/seguro com preset (ver
// email-provider-presets.ts) se o usuário não informar — continuam SMTP por
// baixo dos panos, exigindo senha de app (Gmail) ou senha normal/OAuth
// (Outlook, fora do escopo aqui). SMTP_CUSTOM exige host/porta/seguro
// explícitos, pra qualquer outro provedor SMTP.
export enum TipoProvedorEmail {
  GMAIL = 'GMAIL',
  OUTLOOK = 'OUTLOOK',
  SMTP_CUSTOM = 'SMTP_CUSTOM',
}
