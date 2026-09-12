# CLAUDE.md

Este arquivo orienta o Claude Code (claude.ai/code) ao trabalhar com o código deste repositório.

## O que é

Flowly: um backend NestJS + TypeORM (Postgres) para um motor de workflow estilo Kanban ("processos" com "fases" e "cards" que transitam entre elas), com um motor de regras ("automações") que reage a eventos de card, um sistema de permissões (por grupo, não por usuário), autenticação JWT, anexos de arquivo (MinIO) e atualizações em tempo real via Socket.IO. Código, comentários e mensagens da API estão em português — mantenha o código novo consistente com isso.

## Comandos

```bash
npm run start:dev        # modo watch (nest start --watch)
npm run build             # nest build
npm run lint               # eslint --fix em src/apps/libs/test
npm run format              # prettier --write em src/test

npm test                     # testes unitários jest (*.spec.ts, rootDir: src)
npm run test:watch
npm run test:cov
npm run test:e2e            # jest -c test/jest-e2e.json

# rodar um arquivo de teste específico
npx jest src/caminho/do/arquivo.spec.ts
# rodar um teste específico pelo nome
npx jest src/caminho/do/arquivo.spec.ts -t "nome do teste"
```

A infra local (Postgres + MinIO + a própria aplicação) roda via `docker-compose.yml`; copie `.env.example` para `.env` antes. `TypeOrmModule.forRoot` está com `synchronize: true` (sem migrations) — o schema segue as entities automaticamente em dev.

## Arquitetura

### Processo → Fase → Card, e o grafo de transições

Um `Processo` (`src/processos`) tem um conjunto ordenado de `Fase`s (`src/fases`) e um grafo de `FaseTransicao` (arestas direcionadas entre fases). Um `Card` (`src/cards`) sempre está em `faseAtualId` dentro de um processo. Mover um card nunca é uma escrita livre em `faseAtualId` — sempre passa por `moverCardParaFase` (`src/cards/card-creation.helper.ts`), que checa se existe uma `FaseTransicao` para o par origem→destino, grava uma linha em `CardMovimentacao` e dispara o gatilho `CARD_ENTROU_NA_FASE` para a fase de destino. A criação de card passa pelo helper irmão `criarCardEmFase`, que sempre coloca o novo card na fase de menor `ordem` do processo (não dá pra escolher outra fase inicial) e também dispara `CARD_ENTROU_NA_FASE`.

Esses dois helpers foram extraídos como função livre (não método de service) especificamente pra evitar dependência circular entre `CardsService` e `AutomacoesService` — os dois chamam o mesmo helper em vez de um importar o outro.

### Resolução do título do card

O `titulo` de um card ou vem explícito, ou (se o processo tiver `tituloCampoId` configurado) é derivado de `campos[tituloCampoId]` no momento da criação — ver `resolverTitulo` em `card-creation.helper.ts`. `processo.formularioEntrada` define os campos que o frontend deve coletar na criação do card, mas o backend ainda não valida `campos` contra esse schema.

### Cards pai/filho via ProcessoConexao

`ProcessoConexao` (`src/processos/entities/processo-conexao.entity.ts`) define uma ligação de `posicao` fixa de um processo pra outro. A coluna `filhos` de um card é um array `(string | null)[]` indexado por essa `posicao` — um slot fica `null` até que um card filho seja criado ali, e os slots nunca são reaproveitados mesmo se a conexão for depois removida. Cards pai referenciam os filhos pelo índice em `filhos`; cards filho guardam `paiCardId`/`paiConexaoId` de volta pro pai. Essa estrutura é montada pela ação de automação `CRIAR_CARD_FILHO` e lida por `MOVER_CARD_FILHO`/`MOVER_CARD_PAI`.

### Motor de automações (`src/automacoes`)

Dois gatilhos existem hoje: `CARD_ENTROU_NA_FASE` (por fase) e `CAMPO_ATUALIZADO` (por campo). Ações: `ATUALIZAR_CAMPO`, `ATUALIZAR_TITULO`, `CRIAR_CARD_FILHO`, `MOVER_CARD_PAI`, `MOVER_CARD_FILHO`, `MOVER_CARD_ATUAL`. Tudo roda dentro da *mesma transação* da operação que disparou o gatilho (criação ou movimentação de card) — se qualquer ação lançar erro, a transação inteira é desfeita, inclusive a operação original. Valores de config do tipo string (ex.: `valor` de `ATUALIZAR_CAMPO`, `titulo` de `ATUALIZAR_TITULO`) passam por `interpolarTemplate` (`src/common/template.util.ts`), que substitui placeholders `{chave}` pelos valores de `card.campos` (chave ausente/`null`/`undefined` vira string vazia, nunca lança erro).

Automações podem se encadear (o efeito colateral de uma ação dispara outra automação), protegido por `PROFUNDIDADE_MAXIMA_AUTOMACAO = 5` em `automacoes.service.ts` — ao estourar, lança erro e desfaz a cadeia inteira, não só a automação culpada. Toda automação disparada grava uma linha de auditoria em `AutomacaoExecucao` (`SUCESSO`/`ERRO`), mesmo em caso de falha, antes do erro subir e a transação ser desfeita (a própria linha de auditoria faz parte da mesma transação, então no rollback ela some também — linhas de auditoria só sobrevivem pra cadeias que efetivamente commitam).

Ao adicionar um novo tipo de gatilho/ação: acrescente o valor no enum (`enums/gatilho-tipo.enum.ts` ou `enums/acao-tipo.enum.ts`), um case de validação em `validarGatilho`/`validarAcao` (roda na criação/atualização da automação) e um case de execução em `executarAcao` ou um novo método `executarGatilho*`.

`cardsCriados`/`cardsAtualizados` são parâmetros acumuladores passados por toda a cadeia de chamadas (helper → automation service → chamadas aninhadas do helper) pra que quem chamou possa emitir eventos WebSocket (`card:criado`/`card:atualizado`) *depois* que a transação for commitada — nunca durante ela, já que qualquer coisa dentro dela ainda pode ser desfeita por um erro posterior na mesma cadeia.

### Permissões (ver `permissions.md` para a spec completa)

Duas camadas independentes, resolvidas por request: **Organização** (permissão padrão do grupo, vale em todo lugar) e **Processo** (permissão do grupo pra um processo específico, que *sobrescreve totalmente* — não mescla com — a de organização para aquele processo, quando definida). Não existe permissão por usuário; usuários só recebem permissão através de grupos (`Grupo`), e as permissões efetivas de um usuário são a união de todos os seus grupos.

Aplicação: `@RequerPermissao(alias, resolvedorProcessoId?)` (`src/permissoes/decorators/requer-permissao.decorator.ts`) marca metadata na rota; `PermissoesGuard` lê isso e chama `PermissoesService.usuarioTemPermissao`. Sem o decorator, o guard deixa passar (a rota ainda exige login via `JwtAuthGuard` global). `user.isSuperAdmin` ignora toda checagem de permissão.

O `resolvedorProcessoId` diz qual processo é o escopo da checagem. A maioria das rotas está aninhada sob `/processos/:id/...`, então `porParametro('id')`/`porParametro('processoId')` bastam; `CardsController` não é aninhado assim, então suas rotas usam `porCard()` (`src/permissoes/decorators/resolvedores.ts`), que faz uma consulta ao banco de `cardId` → `processoId`. Omitir o resolvedor significa "checar só permissão de nível Organização".

O catálogo de permissões (`src/permissoes/catalogo-permissoes.ts`) é uma lista fixa, definida em código (aliases `entidade.evento`), semeada no banco na subida da aplicação — não é editável via API. Adicionar uma permissão nova significa acrescentá-la aqui *e* proteger a rota correspondente com `@RequerPermissao`.

### Realtime (`src/realtime`)

Socket.IO puro, ainda sem autenticação na camada de socket (CORS `origin: '*'`, sem auth em `processo:inscrever`). Uma "sala" por processo (`processo:{id}`); clients entram/saem explicitamente. O card completo é emitido em toda mutação (`card:criado`, `card:atualizado`, `card:removido`) — nunca um diff — então o frontend só substitui sua cópia local do card.

### Storage (`src/storage`)

Wrapper fino sobre o MinIO (`StorageService`), bucket criado automaticamente na subida do módulo. As object keys ficam guardadas nas entities (ex.: `Processo.imagemObjectKey`, `CardAnexo`) mas nunca são expostas direto — sempre servidas por uma rota dedicada `GET .../imagem` ou de download de anexo, que faz stream a partir do MinIO.

### Auth

Baseado em JWT (`src/auth`), o decorator `@Public()` isenta uma rota do `JwtAuthGuard` global. O login retorna a mesma mensagem de erro tanto pra "usuário não encontrado" quanto pra "senha errada" (evita vazar qual dos dois foi). `User.senhaHash` (bcrypt) nunca é incluído em nenhuma resposta da API.
