import sanitizeHtml from 'sanitize-html';

// Allowlist ampla (tags de formatação/estrutura + CSS inline em `style`) —
// cobre praticamente qualquer estilização visual normal (cor, fonte,
// espaçamento, layout flex, tabela, imagem) sem abrir as poucas coisas que
// viram vetor de ataque de verdade: <script>/<iframe>/<object>/<embed>/
// <form>, atributos on* (onclick, onerror...), URLs "javascript:", e
// propriedades CSS que permitem escapar do layout do alerta (position/
// z-index/top/left/right/bottom) ou carregar recurso externo escondido
// (background-image/url() — por isso `background`/`background-color` só
// aceitam cor, nunca a forma completa do shorthand). Usado sempre que HTML
// vindo de config de step (que pode encadear $stepRef de uma API externa via
// HTTP_REQUEST, ou de um CODIGO_JAVASCRIPT) vai ser emitido pro front
// renderizar direto (innerHTML) — nunca confie nesse conteúdo sem passar por
// aqui antes.
const COR =
  /^(#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)|[a-z]+)$/i;
// Um valor de medida isolado — "0" sem unidade é válido em CSS (e comum em
// shorthands como "padding: 8px 0"). padding/width/border-radius/etc. nunca
// são negativos de verdade (o navegador ignora se forem), então essa versão
// não aceita "-".
const MEDIDA_UNIDADE = `\\d+(\\.\\d+)?(px|em|rem|%|vw|vh)`;
const MEDIDA = new RegExp(`^(0|${MEDIDA_UNIDADE})$`);
const MEDIDA_LISTA = new RegExp(
  `^(0|${MEDIDA_UNIDADE})(\\s+(0|${MEDIDA_UNIDADE})){0,3}$`,
);
// margin (e variantes -top/-right/-bottom/-left) são o único caso de
// espaçamento onde negativo é uso legítimo e comum (aproximar elementos) —
// "auto" também (ex.: "margin: 0 auto" pra centralizar).
const MEDIDA_UNIDADE_MARGEM = `-?\\d+(\\.\\d+)?(px|em|rem|%|vw|vh)`;
const MEDIDA_MARGEM = new RegExp(`^(0|auto|${MEDIDA_UNIDADE_MARGEM})$`);
const MEDIDA_LISTA_MARGEM = new RegExp(
  `^(0|auto|${MEDIDA_UNIDADE_MARGEM})(\\s+(0|auto|${MEDIDA_UNIDADE_MARGEM})){0,3}$`,
);
const BORDA = new RegExp(
  `^\\d+(\\.\\d+)?px\\s+(solid|dashed|dotted|double)\\s+(#[0-9a-f]{3,8}|rgb\\([^)]*\\)|rgba\\([^)]*\\)|[a-z]+)$`,
  'i',
);

function propriedadesEspacamento(
  base: string,
  { negativo }: { negativo: boolean },
): Record<string, RegExp[]> {
  const token = negativo ? MEDIDA_MARGEM : MEDIDA;
  const lista = negativo ? MEDIDA_LISTA_MARGEM : MEDIDA_LISTA;
  return {
    [base]: [lista],
    [`${base}-top`]: [token],
    [`${base}-right`]: [token],
    [`${base}-bottom`]: [token],
    [`${base}-left`]: [token],
  };
}

export function sanitizarHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'b',
      'strong',
      'i',
      'em',
      'u',
      's',
      'strike',
      'del',
      'ins',
      'mark',
      'small',
      'sup',
      'sub',
      'br',
      'hr',
      'p',
      'div',
      'span',
      'ul',
      'ol',
      'li',
      'dl',
      'dt',
      'dd',
      'a',
      'img',
      'code',
      'pre',
      'blockquote',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'td',
      'th',
      'figure',
      'figcaption',
    ],
    allowedAttributes: {
      // target/rel precisam estar na allowlist mesmo não vindo do config
      // original: são adicionados pelo transformTags abaixo, e o
      // allowedAttributes roda depois do transform — sem isso, o próprio
      // sanitizador removeria os atributos que ele mesmo acabou de inserir.
      a: ['href', 'target', 'rel', 'style'],
      img: ['src', 'alt', 'width', 'height', 'style'],
      td: ['colspan', 'rowspan', 'style'],
      th: ['colspan', 'rowspan', 'style'],
      '*': ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https'],
    },
    // Só propriedades puramente visuais (cor/fonte/espaçamento/borda/layout
    // flex) — nunca position/z-index/top/left/right/bottom (deixaria o
    // conteúdo escapar do layout do alerta) nem background-image/content
    // (permitiriam carregar uma URL externa escondida via CSS, sem precisar
    // de <img>).
    allowedStyles: {
      '*': {
        color: [COR],
        background: [COR],
        'background-color': [COR],
        'border-color': [COR],
        'font-family': [/^[a-z0-9\s,'"-]+$/i],
        'font-size': [MEDIDA],
        'font-weight': [/^(normal|bold|bolder|lighter|[1-9]00)$/],
        'font-style': [/^(normal|italic|oblique)$/],
        'text-align': [/^(left|right|center|justify)$/],
        'text-decoration': [/^(none|underline|line-through|overline)$/],
        'line-height': [/^(\d+(\.\d+)?|normal)$/],
        ...propriedadesEspacamento('padding', { negativo: false }),
        ...propriedadesEspacamento('margin', { negativo: true }),
        border: [BORDA],
        'border-top': [BORDA],
        'border-right': [BORDA],
        'border-bottom': [BORDA],
        'border-left': [BORDA],
        'border-radius': [MEDIDA],
        'box-sizing': [/^(border-box|content-box)$/],
        width: [MEDIDA],
        height: [MEDIDA],
        'max-width': [MEDIDA],
        'min-width': [MEDIDA],
        'max-height': [MEDIDA],
        'min-height': [MEDIDA],
        display: [/^(block|inline|inline-block|flex|inline-flex|none)$/],
        'align-items': [/^(flex-start|flex-end|center|baseline|stretch)$/],
        'justify-content': [
          /^(flex-start|flex-end|center|space-between|space-around|space-evenly)$/,
        ],
        gap: [MEDIDA_LISTA],
        'flex-direction': [/^(row|row-reverse|column|column-reverse)$/],
        'flex-wrap': [/^(nowrap|wrap|wrap-reverse)$/],
      },
    },
    transformTags: {
      // Respeita target="_self" (mesma aba) quando o autor pedir
      // explicitamente; qualquer outro valor (ausente, "_blank" ou lixo)
      // vira "_blank". rel="noopener noreferrer" é sempre forçado quando
      // abre em nova aba — nunca opcional, protege contra reverse
      // tabnabbing (a página aberta poder manipular window.opener).
      a: (tagName, attribs) => {
        const mesmaAba = attribs.target === '_self';
        const novosAttribs: Record<string, string> = { ...attribs };
        if (mesmaAba) {
          novosAttribs.target = '_self';
          delete novosAttribs.rel;
        } else {
          novosAttribs.target = '_blank';
          novosAttribs.rel = 'noopener noreferrer';
        }
        return { tagName: 'a', attribs: novosAttribs };
      },
    },
  });
}
