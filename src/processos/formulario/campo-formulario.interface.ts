import { CampoFormularioTipo } from './campo-formulario-tipo.enum';

// Formulário de entrada do processo: usado (ainda sem validação — isso vem
// depois) pelo front pra saber quais campos pedir ao criar um card novo.
export interface CampoFormulario {
  id: string;
  rotulo: string;
  tipo: CampoFormularioTipo;
  obrigatorio: boolean;
  ordem: number;
  mascara?: string;
  // Obrigatório para SELECAO/RADIO. Opcional para CHECKBOX: presente vira
  // grupo de múltipla escolha (valor = array), ausente vira um checkbox
  // booleano único (valor = true/false, igual TOGGLE só que outro visual).
  opcoes?: string[];
  // Só ARQUIVO. Ex: ["application/pdf", "image/png"].
  tiposArquivoPermitidos?: string[];
}
