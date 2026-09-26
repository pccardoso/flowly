import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

const ALGORITMO = 'aes-256-gcm';
const TAMANHO_IV = 12;
const TAMANHO_TAG = 16;

// Chave de cifragem de segredos em repouso (hoje só a senha/app-password dos
// ProvedorEmail — ver src/email). Prioriza EMAIL_CREDENTIALS_KEY (32 bytes em
// hex); sem ela, deriva uma chave determinística de JWT_SECRET via scrypt —
// funciona sem configuração extra, mas troca de JWT_SECRET sem
// EMAIL_CREDENTIALS_KEY fixo invalidaria segredos já cifrados.
function obterChave(): Buffer {
  const chaveConfigurada = process.env.EMAIL_CREDENTIALS_KEY;
  if (chaveConfigurada) {
    const chave = Buffer.from(chaveConfigurada, 'hex');
    if (chave.length === 32) {
      return chave;
    }
  }
  const segredo = process.env.JWT_SECRET ?? 'troque-este-segredo-em-producao';
  return scryptSync(segredo, 'flowly-credenciais-em-repouso', 32);
}

// Formato do valor cifrado: base64(iv[12] || authTag[16] || ciphertext).
export function cifrar(textoPlano: string): string {
  const iv = randomBytes(TAMANHO_IV);
  const cipher = createCipheriv(ALGORITMO, obterChave(), iv);
  const cifrado = Buffer.concat([
    cipher.update(textoPlano, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), cifrado]).toString('base64');
}

export function decifrar(valorCifrado: string): string {
  const bruto = Buffer.from(valorCifrado, 'base64');
  const iv = bruto.subarray(0, TAMANHO_IV);
  const tag = bruto.subarray(TAMANHO_IV, TAMANHO_IV + TAMANHO_TAG);
  const cifrado = bruto.subarray(TAMANHO_IV + TAMANHO_TAG);
  const decipher = createDecipheriv(ALGORITMO, obterChave(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString(
    'utf8',
  );
}
