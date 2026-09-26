// Catálogo FIXO de sons de alerta (arquivos mp3 na pasta `sounds/` da raiz do
// projeto) — por enquanto não há upload nem cadastro de sons: pra adicionar um,
// coloque o mp3 na pasta e acrescente uma linha aqui.
//
// O `id` é o identificador estável que trafega na API/config de step (nunca o
// nome do arquivo, que tem espaço e parênteses); `arquivo` é só o nome dentro
// da pasta.
export interface SomNotificacao {
  id: string;
  rotulo: string;
  arquivo: string;
}

export const SONS_NOTIFICACAO: SomNotificacao[] = Array.from(
  { length: 10 },
  (_, i) => ({
    id: `efeito-${i + 1}`,
    rotulo: `Efeito ${i + 1}`,
    arquivo: `efect (${i + 1}).mp3`,
  }),
);

export function buscarSom(id: string): SomNotificacao | undefined {
  return SONS_NOTIFICACAO.find((som) => som.id === id);
}
