import { interpolarTemplate } from '../common/template.util';
import { StepTipo } from './enums/step-tipo.enum';

export interface ReferenciaStep {
  $stepRef: string;
  $campo: string;
}

// Formato reservado de referência dentro de um `config` de step: em vez de
// um literal, o valor de qualquer chave pode ser
// { "$stepRef": "<apelido>", "$campo": "<chave>" } pra apontar pra saída de
// outro step conectado a este (ver IntegracaoConexao). Resolvido uma única
// vez, de forma genérica, antes de chamar o StepExecutor — nenhum executor
// individual precisa saber que essa sintaxe existe.
// Usado pelos validarConfig de campos "de dados" (ex.: titulo, valor) que
// aceitam tanto um literal string quanto uma referência $stepRef — campos
// "estruturais" (faseId, conexaoId, campo) continuam exigindo string literal
// pura, porque precisam ser validados contra o banco já na criação/edição da
// integração (não dá pra checar se uma fase existe se o id só é conhecido em
// tempo de execução).
export function ehStringOuReferencia(valor: unknown): boolean {
  return typeof valor === 'string' || ehReferenciaStep(valor);
}

export function ehReferenciaStep(valor: unknown): valor is ReferenciaStep {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    typeof (valor as ReferenciaStep).$stepRef === 'string' &&
    typeof (valor as ReferenciaStep).$campo === 'string'
  );
}

// Igual à resolução de nível superior de resolverConfigStep, mas recursiva —
// percorre objeto/array em qualquer profundidade, resolvendo $stepRef e
// {chave} em cada string/objeto encontrado. Usado só pelas chaves marcadas em
// CHAVES_PROFUNDAS_POR_STEP (hoje: HTTP_REQUEST.headers/body), porque esses
// campos são estruturas livres definidas pelo usuário (cabeçalhos, corpo de
// requisição) onde faz sentido referenciar a saída de outro step em qualquer
// nível, não só a chave inteira.
function resolverValorProfundo(
  valor: unknown,
  saidasPorApelido: Map<string, Record<string, unknown>>,
  campos: Record<string, unknown>,
  semInterpolacao: boolean,
): unknown {
  if (ehReferenciaStep(valor)) {
    const saidaOrigem = saidasPorApelido.get(valor.$stepRef);
    return saidaOrigem?.[valor.$campo] ?? null;
  }
  if (typeof valor === 'string') {
    return semInterpolacao ? valor : interpolarTemplate(valor, campos);
  }
  if (Array.isArray(valor)) {
    return valor.map((item) =>
      resolverValorProfundo(item, saidasPorApelido, campos, semInterpolacao),
    );
  }
  if (valor !== null && typeof valor === 'object') {
    const resultado: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(
      valor as Record<string, unknown>,
    )) {
      resultado[chave] = resolverValorProfundo(
        item,
        saidasPorApelido,
        campos,
        semInterpolacao,
      );
    }
    return resultado;
  }
  return valor;
}

// Substitui, em cada chave de nível superior de `config`: uma referência
// $stepRef pela saída real do step apontado; uma string por ela mesma
// interpolada contra `campos` (mesma sintaxe {chave} de sempre); qualquer
// outro valor passa direto. Chave ausente numa referência (step ainda não
// rodou, ou saída sem aquele campo) vira `null` — nunca lança, mesmo padrão
// de tolerância de interpolarTemplate.
//
// `chavesSemInterpolacao` marca chaves cujo valor-string NUNCA deve passar
// por interpolarTemplate — hoje usado só por CODIGO_JAVASCRIPT.config.codigo,
// pois o código do usuário está cheio de `{`/`}` de sintaxe JS (blocos,
// destructuring, literais de objeto) que não são placeholders.
//
// `chavesProfundas` marca chaves cujo valor deve ser resolvido
// recursivamente (ver resolverValorProfundo) em vez do tratamento padrão de
// nível único — hoje só HTTP_REQUEST.headers/body (ver
// CHAVES_PROFUNDAS_POR_STEP).
export function resolverConfigStep(
  config: Record<string, unknown>,
  saidasPorApelido: Map<string, Record<string, unknown>>,
  campos: Record<string, unknown>,
  chavesSemInterpolacao: ReadonlySet<string> = new Set(),
  chavesProfundas: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  const resolvido: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(config)) {
    if (chavesProfundas.has(chave)) {
      resolvido[chave] = resolverValorProfundo(
        valor,
        saidasPorApelido,
        campos,
        chavesSemInterpolacao.has(chave),
      );
    } else if (ehReferenciaStep(valor)) {
      const saidaOrigem = saidasPorApelido.get(valor.$stepRef);
      resolvido[chave] = saidaOrigem?.[valor.$campo] ?? null;
    } else if (typeof valor === 'string' && !chavesSemInterpolacao.has(chave)) {
      resolvido[chave] = interpolarTemplate(valor, campos);
    } else {
      resolvido[chave] = valor;
    }
  }
  return resolvido;
}

// Todas as referências $stepRef encontradas em `valor`, em qualquer
// profundidade — usado na validação de criação/edição da integração pra
// checar que cada referência de uma chave profunda aponta pra um step
// ancestral (o mesmo que já era checado nas chaves de nível superior).
export function coletarReferenciasStep(valor: unknown): ReferenciaStep[] {
  if (ehReferenciaStep(valor)) {
    return [valor];
  }
  if (Array.isArray(valor)) {
    return valor.flatMap(coletarReferenciasStep);
  }
  if (valor !== null && typeof valor === 'object') {
    return Object.values(valor as Record<string, unknown>).flatMap(
      coletarReferenciasStep,
    );
  }
  return [];
}

export const CHAVES_SEM_INTERPOLACAO_POR_STEP: Partial<
  Record<StepTipo, ReadonlySet<string>>
> = {
  [StepTipo.CODIGO_JAVASCRIPT]: new Set(['codigo']),
};

export const CHAVES_PROFUNDAS_POR_STEP: Partial<
  Record<StepTipo, ReadonlySet<string>>
> = {
  [StepTipo.HTTP_REQUEST]: new Set(['headers', 'body']),
  [StepTipo.ACAO_ATUALIZAR_CAMPOS_LOTE]: new Set(['valores']),
  [StepTipo.EMAIL]: new Set(['anexoIds']),
};
