# Plano: Execução assíncrona de Automações e Integrações + step REPEAT

## 1. Motivação

Hoje, tanto Automações quanto Integrações rodam **dentro da mesma transação** da operação que disparou o gatilho (criar card, mover card, atualizar campo). Se qualquer step/ação lançar erro, a transação inteira é desfeita — **inclusive o save original do usuário**.

Problema concreto: um usuário preenchendo um campo longo dispara uma automação/integração mal configurada por outra pessoa (o gerente do processo); o step quebra; o usuário não consegue salvar o próprio card e nem sabe por quê. A linha de auditoria do erro também é desfeita no rollback (`AutomacaoExecucao`/`IntegracaoExecucao` ficam dentro da mesma transação), então **nem o gerente consegue ver o que aconteceu**.

Decisão: o save do usuário nunca deve esperar, bloquear ou ser desfeito por causa de uma automação/integração. Cadeias de automação/integração passam a rodar em background, na sua própria transação, com falhas visíveis apenas para quem configura o processo — nunca para quem só está preenchendo um card.

Escopo: unificar o modelo para **Automações e Integrações**, não só Integrações.

## 2. Estado atual (referência)

- `CardsService.criar/mover/atualizar` abre uma transação (`this.dataSource.transaction(...)`, `src/cards/cards.service.ts`).
- Dentro dela, `card-creation.helper.ts` chama `gatilho-dispatch.helper.ts`, que chama `AutomacoesService.executarGatilho*` e `IntegracoesService.executarGatilho*` **de forma síncrona, com o mesmo `EntityManager`**.
- `IntegracoesService.executarGrafo` (`src/integracoes/integracoes.service.ts:622`) roda um `for` topológico síncrono sobre os steps alcançáveis.
- Encadeamento (uma ação dispara outro gatilho) é protegido por contador de profundidade síncrono (`PROFUNDIDADE_MAXIMA_AUTOMACAO = 5`, `PROFUNDIDADE_MAXIMA_INTEGRACAO = 5`).
- Único precedente de "sair da transação": o step EMAIL. Ele só grava uma linha `EmailEnvio` (`status: PENDENTE`) dentro da transação; o `despacharEnvios` (enfileira no BullMQ de verdade) só roda **depois** do commit, disparado pelo `CardsService`.
- Auditoria de erro (`AutomacaoExecucao`/`IntegracaoExecucao` com `status: ERRO`) é escrita dentro da mesma transação que falhou — **hoje ela some no rollback**. Isso precisa ser corrigido independente do resto do plano.
- BullMQ + Redis já estão configurados (`src/app.module.ts`), com uma fila hoje (`email-envio`, `src/email/`).
- Não existe hoje nenhum conceito de loop/repetição no motor de Integrações. CONDICAO é a única construção de controle de fluxo, e é *forward-only* (ativa/desativa arestas por ramo, nunca revisita um step).

## 3. Desenho alvo

### 3.1 Fluxo novo

```
Hoje:
  request → transação { save do card + automações/integrações (síncrono) } → commit → response
  (erro em qualquer step desfaz TUDO, inclusive o save)

Novo:
  request → transação { save do card } → commit → response (rápido, sempre)
                                              │
                                              └─> enfileira 1 job por gatilho disparado (BullMQ)
                                                     │
                                                     └─> worker: transação própria
                                                            { relê o card, executa a cadeia
                                                              (automação e/ou integração,
                                                              encadeamento síncrono até
                                                              profundidade máxima) }
                                                            → commit (ou rollback só da cadeia)
                                                            → emite card:atualizado (se aplicável)
                                                            → se erro: grava auditoria ERRO
                                                              em transação separada (sobrevive)
```

Só o **primeiro disparo** (o que hoje sai de dentro da transação do `CardsService`) vai para a fila. Encadeamento entre automações/integrações dentro de uma mesma cadeia continua síncrono dentro da transação do worker, exatamente como hoje — isso limita o raio da mudança e mantém `PROFUNDIDADE_MAXIMA_*` funcionando sem alterações.

### 3.2 Componentes novos

- **Fila `automacao-integracao-gatilho`** (BullMQ), registrada em um módulo novo ou existente (`src/automacoes` / `src/integracoes`).
- **Processor** (`GatilhoExecucaoProcessor`, `@Processor`) que recebe o payload do job e chama a mesma lógica de hoje (`executarGatilho*`), mas abrindo sua própria transação via `DataSource`.
- **Payload do job** (mínimo necessário para reconstruir o contexto, já que não dá pra confiar em snapshot):
  ```ts
  {
    tipoGatilho: 'CARD_CRIADO' | 'CARD_ENTROU_NA_FASE' | 'CAMPO_ATUALIZADO',
    cardId: string,
    processoId: string,
    faseId?: string,        // para CARD_ENTROU_NA_FASE
    campoAlterado?: string, // para CAMPO_ATUALIZADO
    usuarioId: string,      // quem disparou, para permissão/auditoria
  }
  ```
- **Dispatch**: `gatilho-dispatch.helper.ts` deixa de chamar `AutomacoesService`/`IntegracoesService` direto; passa a só montar o payload e dar `queue.add(...)`. Isso só pode acontecer **depois do commit** — mesmo padrão que `despacharEnvios` já usa hoje (acumular e disparar após a transação do `CardsService` fechar).

### 3.3 Releitura de estado (staleness)

O worker relê o card do banco no início da sua própria transação — nunca reaproveita um snapshot de quando o gatilho foi originalmente disparado, porque entre o commit do save e a execução do job o card pode ter mudado de novo (mesmo usuário ou outro). Isso vale tanto pra dados usados em `interpolarTemplate` quanto para avaliação de `CONDICAO`.

### 3.4 Auditoria que sobrevive a erro (correção independente do resto)

Hoje, se uma cadeia falha, a auditoria de erro é desfeita junto (mesma transação). Novo comportamento: `executarGatilho*`/`executarGrafo` continuam gravando a auditoria dentro da transação da cadeia (para o caso de sucesso, que já funciona bem), mas o bloco `catch` passa a:
1. deixar a transação da cadeia dar rollback normalmente (desfaz só o que a cadeia fez);
2. abrir uma transação nova, curta, só para gravar a linha `AutomacaoExecucao`/`IntegracaoExecucao` com `status: ERRO` e o motivo — essa linha precisa sobreviver para o gerente revisar.

### 3.5 Realtime

Cada transação que commita emite seu próprio evento. O save do usuário emite `card:atualizado` na hora (como hoje). Se a cadeia em background terminar com sucesso e tiver alterado o card, o worker emite um segundo `card:atualizado` com o card já refletindo o resultado da automação/integração. Se a cadeia falhar, nenhum evento adicional é emitido (o card não mudou).

### 3.6 Step REPEAT (motivação original desta conversa)

Com o modelo acima, REPEAT deixa de precisar de tratamento especial de fila — ele já vai rodar dentro de um worker em background por padrão. Fica sendo só uma construção de loop:
- Reaproveita `calcularAlcancaveis` (já calcula a subárvore alcançável a partir de um step) para pegar "tudo que vem depois do REPEAT".
- Executa essa subárvore em um `for i in 0..N`, com `N` fixo por configuração (por enquanto, sem iteração sobre lista).
- Injeta `{repeticao.indice}` no contexto de template (mesmo mecanismo de `interpolarTemplate`) para os steps do corpo poderem referenciar a iteração atual.
- Teto duro de segurança: `MAX_ITERACOES_REPETICAO` (constante análoga a `PROFUNDIDADE_MAXIMA_INTEGRACAO`), para nunca deixar um job rodar indefinidamente mesmo já estando fora do caminho da request.

### 3.7 Impacto no frontend

Este repo é só backend — mudanças de tela ficam fora deste plano, mas dois pontos precisam ser comunicados/verificados com quem mexe no front:

1. **Erro de automação deixa de aparecer como erro na tela de save.** Hoje, se uma automação quebra, o request de salvar falha e o usuário vê um erro. Depois da mudança, o save sempre retorna rápido e com sucesso; a falha só existe na auditoria. Qualquer tratamento de erro específico para esse caso no front deixa de ser acionado (simplificação, não quebra).
2. **Precisa existir uma tela de auditoria para o gerente do processo** ver execuções de `AutomacaoExecucao`/`IntegracaoExecucao` com `status: ERRO`. Se essa tela não existir ainda, é o único item de front realmente necessário — sem ela, falhas passam a ser invisíveis para todo mundo, o que seria pior que hoje.

## 4. Fora de escopo / riscos aceitos

- Loop com iteração sobre lista (for-each) fica para depois — por enquanto só contagem fixa.
- Retry automático de cadeias falhas via BullMQ **não** está incluído por padrão: reprocessar um job que já executou parte dos side effects (ex.: já criou um card filho antes de falhar no passo seguinte) pode duplicar efeitos. Se quisermos retry, precisa de uma estratégia de idempotência antes.
- Encadeamento entre automações continua síncrono dentro do worker (não fica "fila dentro de fila"). Se uma cadeia muito profunda/pesada travar um worker, isso não afeta o usuário, mas pode atrasar outros jobs na mesma fila — mitigável depois com concorrência/filas separadas se virar problema real.

## 5. Fases de implementação sugeridas

1. ✅ **Corrigir a sobrevivência da auditoria de erro** (item 3.4) — feito em `automacoes.service.ts`/`integracoes.service.ts` (`registrarErroForaDaTransacao`/`registrarExecucaoErroForaDaTransacao`).
2. ✅ **Integrações + Automações, unificadas**: como as duas engines são disparadas pelos mesmos três pontos (`cards/gatilho-dispatch.helper.ts`), não dá pra diferir uma sem a outra — o desacoplamento saiu unificado desde já. Implementado: novo módulo `src/gatilhos-execucao/` (fila BullMQ `gatilho-execucao` + processor), `criarCardEmFase`/`moverCardParaFase` (`card-creation.helper.ts`) passam a enfileirar em vez de rodar inline quando `profundidade === 0`, `CardsService` enfileira depois do commit.
3. ✅ **Step REPETICAO** (item 3.6) — novo `StepTipo.REPETICAO` (só no motor de Integrações; Automações não tem grafo, não se aplica). Desenho final (revisado a pedido do usuário): dois ramos de saída fixos, `ENQUANTO` (corpo — repete `quantidade` vezes) e `FINALIZADO` (roda uma vez, depois que o corpo termina todas as voltas) — mesmo mecanismo `ramoOrigem` que CONDICAO já usa, só que os dois ids são fixos (`src/integracoes/enums/repeticao-ramo.enum.ts`), não vêm de config. `IntegracoesService.executarSequencia`: o corpo (tudo alcançável só pelo ramo ENQUANTO) sai do loop plano e é reexecutado recursivamente `quantidade` vezes (cada iteração com cópias frescas de `executadosSet`/`saidasPorApelido`/`ramoAtivoPorStepId`, injetando `repeticaoIndice` via `{repeticaoIndice}`); ao final, `ramoAtivoPorStepId` marca o REPETICAO como `FINALIZADO` no escopo externo, e o loop plano continua normalmente — os steps do ramo FINALIZADO rodam uma vez só, exatamente como um ramo comum de CONDICAO. `validarGrafo` ganhou: `quantidade` limitado por `MAX_ITERACOES_REPETICAO = 50`; toda conexão saindo de um REPETICAO precisa de `ramoOrigem` igual a ENQUANTO ou FINALIZADO; nenhum step pode ser alcançável pelos dois ramos ao mesmo tempo; nenhum step do corpo ENQUANTO pode receber conexão de fora dele. Catálogo (`step-tipo-catalogo.ts`) expõe `ramoEnquanto`/`ramoFinalizado`. Testado ao vivo (duas rodadas — desenho antigo de "corpo único" e o atual de dois ramos): ENQUANTO rodou 3x com `repeticaoIndice` 0/1/2 corretos, FINALIZADO rodou exatamente 1x depois; rejeição de `quantidade > 50`, de conexão sem `ramoOrigem`, de step alcançável pelos dois ramos, e de conexão externa entrando no corpo ENQUANTO — todos os casos negativos recusados como esperado. Também corrigido: a entrada do REPETICAO tinha ficado de fora de `CATALOGO_STEP_TIPOS` (o array estático que alimenta `GET /tipos-step`, de onde a paleta do front lê os tipos disponíveis) — sem isso o step nunca apareceria pra arrastar, mesmo com o motor pronto.
4. ~~Automações~~ — coberto junto da fase 2 (ver acima).
5. ✅ **Validação end-to-end (manual, via Docker)**: processo de teste com uma automação que funciona e outra propositalmente quebrada (mover pra uma fase sem transição configurada), disparadas pelo mesmo evento de card. Confirmado:
   - `PATCH /cards/:id/campos` respondeu em ~40ms nos dois casos — nunca esperou a automação.
   - A automação boa aplicou o efeito em background (~150ms depois, via job assíncrono).
   - A automação quebrada teve seu efeito desfeito (fase do card não mudou) e gerou uma linha `ERRO` em `automacao_execucoes` com a mensagem certa — sobrevivendo ao rollback, como pretendido.
   - Log do processor (`GatilhoExecucaoProcessor`) registrou o warning sem derrubar o worker nem re-tentar (evita duplicar efeitos colaterais).

## 6. Perguntas em aberto

- Existe hoje endpoint/tela para listar `AutomacaoExecucao`/`IntegracaoExecucao` por processo? Se sim, só precisa garantir que erros passem a aparecer lá; se não, precisa ser criado (fora do escopo backend deste plano, mas é pré-requisito para o valor real da mudança).
- Uma fila só para as duas engines, ou uma fila por engine (`automacao-gatilho` / `integracao-gatilho`)? Sugestão: uma só, com `tipoEngine` no payload, para simplificar operação (menos filas para monitorar).
