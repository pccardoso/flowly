// Única definição de "vencido / prestes a vencer" do sistema: o estado NUNCA é
// gravado no banco, sempre calculado a partir de Card.dataVencimento. Usado
// na resposta da API, no evento realtime e (em SQL equivalente) na varredura
// que dispara os gatilhos GATILHO_CARD_VENCIDO / GATILHO_CARD_PRESTES_A_VENCER
// (ver src/vencimentos).
export enum VencimentoStatus {
  NO_PRAZO = 'NO_PRAZO',
  PRESTES_A_VENCER = 'PRESTES_A_VENCER',
  VENCIDO = 'VENCIDO',
}

// Filtro de listagem: além dos três estados, cards sem data.
export enum VencimentoFiltro {
  NO_PRAZO = 'NO_PRAZO',
  PRESTES_A_VENCER = 'PRESTES_A_VENCER',
  VENCIDO = 'VENCIDO',
  SEM_VENCIMENTO = 'SEM_VENCIMENTO',
}

// Janela de "prestes a vencer": fixa em 24h (decisão de produto — não é
// configurável por processo).
export const JANELA_ALERTA_VENCIMENTO_MS = 24 * 60 * 60 * 1000;

// Um vencimento só dispara GATILHO_CARD_VENCIDO até 24h depois de ocorrer:
// evita uma enxurrada de execuções quando uma integração é ligada num
// processo com cards vencidos há muito tempo.
export const TOLERANCIA_DISPARO_VENCIDO_MS = 24 * 60 * 60 * 1000;

export interface VencimentoResumo {
  status: VencimentoStatus;
  // Segundos até o vencimento. Negativo = já venceu (o módulo é o atraso).
  restanteSegundos: number;
}

export function calcularVencimento(
  dataVencimento: Date | string | null | undefined,
  agora: Date = new Date(),
): VencimentoResumo | null {
  if (!dataVencimento) {
    return null;
  }
  const restanteMs = new Date(dataVencimento).getTime() - agora.getTime();
  let status = VencimentoStatus.NO_PRAZO;
  if (restanteMs <= 0) {
    status = VencimentoStatus.VENCIDO;
  } else if (restanteMs <= JANELA_ALERTA_VENCIMENTO_MS) {
    status = VencimentoStatus.PRESTES_A_VENCER;
  }
  return { status, restanteSegundos: Math.trunc(restanteMs / 1000) };
}
