import { calcularVencimento, VencimentoStatus } from './vencimento.util';

describe('calcularVencimento', () => {
  const agora = new Date('2026-09-20T12:00:00.000Z');
  const emHoras = (h: number) => new Date(agora.getTime() + h * 3600_000);

  it('devolve null quando o card não tem data', () => {
    expect(calcularVencimento(null, agora)).toBeNull();
    expect(calcularVencimento(undefined, agora)).toBeNull();
  });

  it('NO_PRAZO quando falta mais de 24h', () => {
    const r = calcularVencimento(emHoras(24.01), agora);
    expect(r?.status).toBe(VencimentoStatus.NO_PRAZO);
  });

  it('PRESTES_A_VENCER quando faltam exatamente 24h (limite incluso)', () => {
    const r = calcularVencimento(emHoras(24), agora);
    expect(r?.status).toBe(VencimentoStatus.PRESTES_A_VENCER);
    expect(r?.restanteSegundos).toBe(86400);
  });

  it('PRESTES_A_VENCER a 1 segundo do vencimento', () => {
    const r = calcularVencimento(new Date(agora.getTime() + 1000), agora);
    expect(r?.status).toBe(VencimentoStatus.PRESTES_A_VENCER);
  });

  it('VENCIDO exatamente no instante do vencimento', () => {
    const r = calcularVencimento(agora, agora);
    expect(r?.status).toBe(VencimentoStatus.VENCIDO);
    expect(r?.restanteSegundos).toBe(0);
  });

  it('VENCIDO com restanteSegundos negativo (atraso)', () => {
    const r = calcularVencimento(emHoras(-2), agora);
    expect(r?.status).toBe(VencimentoStatus.VENCIDO);
    expect(r?.restanteSegundos).toBe(-7200);
  });

  it('aceita string ISO', () => {
    const r = calcularVencimento('2026-09-20T11:00:00.000Z', agora);
    expect(r?.status).toBe(VencimentoStatus.VENCIDO);
  });
});
