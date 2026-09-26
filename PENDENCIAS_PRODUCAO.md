# Pendências para produção

Levantamento feito em 23/09/2026 sobre o que falta para colocar o Flowly na mão de um cliente real.

**Situação atual:** as funcionalidades estão maduras (automações, integrações, permissões, anexos, PDF, busca). Um **piloto controlado** (um cliente, poucos usuários, dados não críticos) é viável depois de resolver os bloqueadores abaixo. Para **produção com dados reais**, também é preciso resolver os itens importantes.

---

## 🔴 Bloqueadores

### 1. WebSocket sem autenticação

- **Onde:** `src/realtime/realtime.gateway.ts` (`@WebSocketGateway({ cors: { origin: '*' } })` e `processo:inscrever`)
- **Problema:** qualquer client que conheça um `processoId` entra na sala `processo:{id}` e recebe em tempo real os cards completos (todos os `campos`), as notificações e as etiquetas. Isso vaza dados diretamente, sem login.
- **Correção:**
  - Validar o JWT no handshake do socket (`handshake.auth.token`) e rejeitar a conexão se ele for inválido ou se o usuário estiver bloqueado.
  - Em `processo:inscrever`, checar a permissão do usuário naquele processo com `PermissoesService.usuarioTemPermissao` (a mesma regra da rota de listar cards).
  - Restringir o CORS do socket às origens do frontend.

### 2. `synchronize: true` no TypeORM

- **Onde:** `src/app.module.ts:107`
- **Problema:** o schema segue as entities automaticamente. Se um campo de entity for renomeado ou removido, o próximo deploy pode **dropar a coluna com os dados do cliente**.
- **Correção:**
  - Gerar uma migration inicial a partir do schema atual e passar a usar `migrations` + `migrationsRun`.
  - `synchronize` deve ficar `false` fora de dev, controlado por variável de ambiente.
  - Atualizar o `CLAUDE.md`, que hoje documenta "sem migrations".

### 3. Segredos com valor padrão

- **Onde:**
  - `src/auth/auth.module.ts:17`: fallback `'dev-secret-troque-em-producao'`
  - `docker-compose.yml`: `JWT_SECRET` com default `troque-este-segredo-em-producao`
  - `EMAIL_CREDENTIALS_KEY`: quando vazio, a chave é derivada de `JWT_SECRET`
  - Senhas padrão do Postgres (`flowly`) e do MinIO (`flowly123`)
- **Problema:** se o `.env` não for configurado, qualquer pessoa consegue forjar um JWT (inclusive de superadmin) com o segredo padrão, que é público no repositório.
- **Correção:**
  - A aplicação deve **falhar no boot** se `JWT_SECRET` ou `EMAIL_CREDENTIALS_KEY` não estiverem definidos, quando `NODE_ENV=production`.
  - Tirar os defaults dos segredos no compose de produção.
  - Gerar segredos fortes (`openssl rand -hex 32`).

### 4. Portas de infraestrutura expostas

- **Onde:** `docker-compose.yml`
- **Problema:** Postgres (5432), MinIO (9000/9001) e Redis (6379, **sem senha**) são publicados no host. Num servidor público, ficam acessíveis pela internet.
- **Correção:**
  - Criar um `docker-compose.prod.yml` que exponha só a app.
  - Colocar a app atrás de um proxy reverso (Caddy/Nginx/Traefik) com **HTTPS**.
  - Configurar `requirepass` no Redis.
  - Fixar a versão da imagem do MinIO (hoje é `minio/minio:latest`).

### 5. SSRF no step HTTP das integrações

- **Onde:** `src/integracoes/step-executors.ts` (comentário na linha ~181 e `fetch` na linha ~1083)
- **Problema:** o step HTTP limita protocolo, tempo e tamanho, mas não bloqueia IPs privados. Quem tem permissão de criar integração consegue fazer o servidor chamar:
  - `169.254.169.254`: metadados da cloud, que podem expor credenciais
  - `redis:6379`, `postgres:5432`, `minio:9000`: serviços internos
  - `localhost` e faixas `10.x`, `172.16-31.x`, `192.168.x`
- **Correção:**
  - Resolver o DNS antes da requisição e bloquear faixas privadas, loopback, link-local e IPv6 equivalentes.
  - Tratar redirects: validar o destino de cada salto, ou usar `redirect: 'manual'`.
  - Opcionalmente, permitir uma allowlist configurável por ambiente.

---

## 🟡 Importante

### 6. Hardening HTTP

- Não há rate limit. `/auth/login` fica aberto a brute force. **Correção:** usar `@nestjs/throttler`, no mínimo no login e nas rotas públicas de formulário.
- Não há `helmet` (headers de segurança).
- `app.enableCors()` em `src/main.ts` aceita qualquer origem. Restringir ao domínio do frontend via variável de ambiente.
- Revisar os limites de tamanho de upload e do body JSON.

### 7. Backup

- Não existe rotina de backup do Postgres nem do bucket do MinIO.
- **Correção:**
  - `pg_dump` agendado com retenção.
  - Replicação ou espelhamento do bucket (`mc mirror`).
  - **Testar o restore** pelo menos uma vez.

### 8. Testes automatizados

- Só há 4 arquivos `*.spec.ts`, e o e2e (`test/app.e2e-spec.ts`) é o de template.
- As validações feitas até agora foram manuais, contra o ambiente Docker.
- **Prioridades de cobertura:**
  - Permissões (guard + resolvedores)
  - Motor de automações (encadeamento, rollback, profundidade máxima)
  - Movimentação de card e transições
  - Execução de integrações

### 9. Controle de versão

- ~79 arquivos modificados ou novos estão fora de commit na branch `feature/implements-workflow`.
- Commitar e organizar antes de começar mudanças de deploy.

### 10. Operação e observabilidade

- Não há endpoint de health check da app (útil para o proxy, o orquestrador e o `healthcheck` do compose).
- Não há logs estruturados (JSON) nem centralização de logs.
- Não há monitoramento ou alertas (erros, fila do Redis, jobs de PDF e integrações falhando).

### 11. Fluxos de usuário faltando

- **Recuperação de senha:** não existe fluxo de "esqueci minha senha".
- **Bootstrap do primeiro superadmin:** hoje é feito manualmente no banco. **Correção:** um comando/script de seed (ex.: `npm run seed:admin`) ou variáveis de ambiente para o primeiro acesso.

---

## 🔵 Decisões de arquitetura a considerar

- **Não é multi-tenant.** Não existe entity `Organizacao`, então cada cliente precisa de uma instância própria (app + Postgres + MinIO + Redis). Isso funciona para poucos clientes. Se a ideia for atender muitos, é preciso decidir entre instância por cliente (com automação de provisionamento) e multi-tenant de verdade.
- **Validação de `campos` contra `formularioEntrada`.** O backend ainda não valida os campos do card contra o schema do formulário (ver `CLAUDE.md`). Um client pode gravar dados fora do formato esperado.

---

## Ordem sugerida

| # | Item | Esforço estimado |
|---|------|------------------|
| 1 | Auth no WebSocket | baixo |
| 2 | Validação dos segredos no boot | baixo |
| 3 | Compose de produção + HTTPS + portas fechadas | baixo/médio |
| 4 | Throttler + helmet + CORS restrito | baixo |
| 5 | Migrations no lugar de `synchronize` | médio |
| 6 | Bloqueio de SSRF | médio |
| 7 | Backup + teste de restore | baixo/médio |
| 8 | Health check + seed do admin | baixo |
| 9 | Testes das áreas críticas | alto (contínuo) |

Com os itens 1 a 7 resolvidos, o sistema fica apto para um **piloto com cliente real**.
