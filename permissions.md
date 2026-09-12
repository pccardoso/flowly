# Sistema de Permissões — Especificação

## 1. Conceito Geral

O sistema possui **duas camadas de permissão**, avaliadas de forma independente:

| Camada | Escopo | Exemplo |
|---|---|---|
| **Organização** | Permissão padrão do grupo, válida em todos os processos | "visualizar processos" |
| **Processo** | Permissão específica de um processo, pode sobrescrever a de organização | "no Processo A, editar e aprovar" |

**Regra de precedência:** a permissão de Processo, quando definida, prevalece sobre a de Organização para aquele processo específico. Se não houver permissão de Processo definida, aplica-se a de Organização.

> Exemplo: um Grupo pode ter só `processo.visualizar` a nível de Organização, mas no Processo A receber `processo.editar` e `processo.aprovar` a nível de Processo — nos demais processos, continua valendo apenas `processo.visualizar`.

**Importante:** não existe permissão individual por usuário. Todo usuário recebe permissões **exclusivamente através dos grupos** aos quais pertence.

## 2. Modelo de Alias

Toda operação/permissão é identificada por um alias no formato:
entidade.evento


- `entidade`: o recurso/domínio (ex: `processo`, `automacao`, `grupo`)
- `evento`: a ação sobre o recurso (ex: `criar`, `editar`, `remover`, `visualizar`, `aprovar`)

### 2.1 Exemplos de aliases

| Alias | Descrição |
|---|---|
| `processo.criar` | Criar um novo processo |
| `processo.editar` | Editar um processo existente |
| `processo.remover` | Remover um processo |
| `processo.visualizar` | Visualizar um processo |
| `processo.aprovar` | Aprovar um processo |
| `automacao.criar` | Criar uma automação |
| `automacao.remover` | Remover uma automação |
| `grupo.criar` | Criar um grupo |
| `grupo.gerenciar` | Gerenciar membros/processos de um grupo |

> Cada entidade deve ter seu conjunto de eventos mapeado explicitamente (ver seção 4). Não existe alias implícito "genérico" tipo `processo` sozinho — todo alias tem entidade **e** evento.

## 3. Grupos

- Um **Grupo** associa **Usuários** a **Processos**.
- É através do grupo que o usuário herda permissões, tanto de Organização quanto de Processo.
- Dentro de um grupo, a permissão de Processo pode ser **diferente por processo associado**.

> Exemplo: Grupo A está associado aos Processos A, B e C.
> - No Processo A, o Grupo A tem `processo.editar` + `processo.aprovar`
> - No Processo B, o Grupo A tem apenas `processo.visualizar`
> - No Processo C, o Grupo A tem `processo.editar`

Um usuário pode pertencer a mais de um grupo. Nesse caso, suas permissões efetivas são a **união** das permissões de todos os grupos aos quais pertence.

### 3.1 Resolução de permissão de um usuário

Para saber se um usuário X pode executar `<alias>` no Processo P:

1. Buscar todos os grupos do usuário X
2. Para cada grupo, verificar se existe permissão de **Processo P** com esse alias → se sim, concede
3. Se nenhum grupo tiver permissão de Processo P, verificar permissão de **Organização** do(s) grupo(s) → se sim, concede
4. Se nada encontrado → nega

## 4. Checklist de mapeamento (a preencher)

Para cada entidade do sistema, listar os eventos válidos:

- [ ] `processo`: criar, editar, remover, visualizar, aprovar, ...
- [ ] `automacao`: criar, editar, remover, executar, ...
- [ ] `grupo`: criar, editar, remover, gerenciar_membros, gerenciar_processos, ...

## 5. Estrutura de dados sugerida (visão alto nível)

permissoes (id, alias, entidade, evento, descricao)

grupos (id, nome)
grupo_usuarios (grupo_id, usuario_id)
grupo_processos (grupo_id, processo_id)

grupo_organizacao_permissoes (grupo_id, permissao_id)
grupo_processo_permissoes (grupo_id, processo_id, permissao_id)