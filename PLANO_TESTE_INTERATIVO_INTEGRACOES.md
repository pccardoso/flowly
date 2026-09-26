# Plano: teste interativo (step a step) de Integrações — v1 simples

## 1. Motivação

Hoje quem monta uma integração só descobre se ela funciona depois de salvar e esperar um evento real acontecer — sem visibilidade de entrada/saída de cada step no meio do caminho. O Pipefy original resolve isso deixando a pessoa "dar play" step a step: arma o gatilho, espera o evento acontecer, mostra entrada/saída, e a saída de cada step já fica disponível pra testar o próximo.

A versão completa (armar e esperar um evento real de produção acontecer) tem riscos e complexidade reais — descritos na conversa que originou este plano. Este documento cobre só a **v1 simples**, que entrega a mesma experiência de "ir step a step vendo entrada/saída", sem a parte de esperar passivamente um evento de produção.

## 2. Ideia central

Em vez de armar e esperar, a pessoa:
1. Escolhe um card real já existente (de teste) no processo da integração.
2. Pede pra "testar" o step do gatilho — o backend roda esse step **agora**, contra o estado atual do card, e devolve entrada/saída na hora (sem esperar nada).
3. Pede pra "testar" o próximo step conectado, mandando junto as saídas de tudo que já testou até ali — o backend resolve `$stepRef`/`{chave}` normalmente (igual a uma execução de verdade) e roda só aquele step.
4. Repete até terminar de validar a integração.

Cada chamada roda o step **de verdade** (mesmos `STEP_EXECUTORS` da produção) — se for um step de escrita, ele escreve de verdade no card; se for EMAIL/HTTP_REQUEST, envia/chama de verdade. Isso foi uma decisão explícita (ver seção 6): sem isso, teria que manter dois motores de execução (um real, um "de mentirinha"), dobrando a manutenção.

## 3. Desenho

### 3.1 Sem sessão no servidor (stateless)

O front acumula as saídas localmente (ele já recebe cada uma na resposta) e reenvia o acumulado a cada chamada. O backend não guarda nenhum estado de teste entre requisições — nada de Redis, nada de tabela nova, nada de expiração pra gerenciar. Mais simples de operar, e o volume de uso (uma pessoa testando manualmente) não justifica o custo de um mecanismo de sessão.

### 3.2 Endpoint único

```
POST /processos/:processoId/integracoes/:integracaoId/testar/steps/:stepApelido
```

Corpo da requisição:
```json
{
  "cardId": "<uuid de um card real do processo>",
  "saidasAnteriores": {
    "gatilho": { "cardId": "...", "titulo": "...", "campos": {...}, "campo": "status", "valorAtual": "aprovado" },
    "outroStepJaTestado": { "...": "..." }
  }
}
```
`saidasAnteriores` é opcional na primeira chamada (testando o gatilho, não tem nada antes dele) e cresce a cada passo — o front é quem monta esse mapa, guardando o que cada resposta anterior devolveu.

Resposta:
```json
{
  "stepApelido": "acaoAtualizarStatus",
  "tipo": "ACAO_ATUALIZAR_CAMPO",
  "entrada": { "campo": "status", "valor": "aprovado" },
  "saida": { "campo": "status", "valorAntigo": null, "valorNovo": "aprovado" }
}
```

Se o step falhar (permissão, validação, erro de execução), a resposta é o erro HTTP normal (mesmas exceptions que a produção já lança) — o front trata igual a qualquer outro erro da API, sem formato especial.

### 3.3 O que o backend faz por dentro

1. Busca a `Integracao` (com `steps`/`conexoes`) e o `IntegracaoStep` de apelido `:stepApelido` — 404 se não existir.
2. Busca o `Card` de `cardId` — 404 se não existir, ou se não for do mesmo processo da integração.
3. Resolve `entradas` com `resolverConfigStep(step.config, mapaDeSaidasAnteriores, card.campos, ...)` — exatamente a mesma função que a execução real usa. `$stepRef` pra um apelido que não está em `saidasAnteriores` (porque ainda não foi testado) resolve pra `null`, igual ao comportamento tolerante de sempre — isso naturalmente empurra a pessoa a testar na ordem das conexões.
4. Se não for gatilho: checa `usuarioServicoId` + permissão, igual `executarSequencia` já faz.
5. Chama `STEP_EXECUTORS[step.tipo].executar(ctx)` de verdade, dentro de uma transação própria (`dataSource.transaction`) — se o step escrever em algo e depois lançar erro no meio, desfaz só essa tentativa.
6. Devolve `{ stepApelido, tipo, entrada, saida }`.

**Não grava nada em `integracao_execucoes`/`integracao_execucao_steps`** — isso é auditoria de execuções reais disparadas por gatilho de produção; misturar teste manual ali confundiria quem revisa depois. Teste fica só na tela, efêmero.

### 3.4 Permissão

`@RequerPermissao('integracao.editar', porParametro('processoId'))` — mesma exigida pra criar/editar a integração. Só quem pode mexer na integração pode testá-la (faz sentido, já que os steps rodam de verdade).

## 4. Limitações conhecidas desta v1 (não são bugs, são escolhas)

- **Não espera evento real de produção.** "Testar o gatilho" só lê o estado atual do card e monta a saída que ele produziria agora — não existe "armar e esperar alguém mexer no card". Pra `GATILHO_CAMPO_ATUALIZADO`, por exemplo, a saída usa o valor atual do campo, não uma mudança que acabou de acontecer.
- **Efeitos colaterais são reais.** Testar um step EMAIL manda o email de verdade; testar um HTTP_REQUEST chama a URL de verdade; testar um ACAO_MOVER_CARD_ATUAL move o card de verdade. Vale o front avisar antes de rodar esses tipos.
- **Alguns steps podem encadear além de si mesmos.** `ACAO_ATUALIZAR_CAMPO`, `ACAO_CRIAR_CARD_FILHO` e os `ACAO_MOVER_CARD_*` chamam por dentro `dispararGatilhosCampoAtualizado`/`criarCardEmFase`/`moverCardParaFase` diretamente — ou seja, testar UM desses steps isoladamente pode disparar de verdade outras automações/integrações do processo que reagem àquele campo/fase, não só o step que você pediu pra testar. Isso é um comportamento herdado do motor de produção, não um bug do modo de teste — mas vale documentar pro usuário final não se assustar.
- **Só integração já salva.** Testa a versão que está no banco — não dá pra testar um rascunho ainda não salvo nesta v1.
- **`FASE` do card, `REPETICAO`, `CONDICAO`:** o grafo não é linear, então "próximo step" não é sempre óbvio depois de um `CONDICAO` (a pessoa escolhe manualmente qual ramo quer seguir testando) ou de um `REPETICAO` (testar o corpo é testar UMA iteração; não há "rodar as N voltas" no modo manual — cada clique roda o step uma vez).

## 5. Fora de escopo (fica pra depois, se fizer falta)

- Armar um gatilho e esperar passivamente um evento real de produção acontecer (a versão completa do Pipefy).
- Testar integrações ainda não salvas (rascunho).
- Suprimir o encadeamento automático durante o teste (precisaria de uma flag nova passada pra dentro do `ContextoExecucaoStep`, checada por cada executor que hoje dispara direto — mudança em vários lugares, não só um).
