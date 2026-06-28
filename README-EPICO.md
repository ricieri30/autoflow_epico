# AutoFlow Epico

Evolucao do **AutoFlow Cadence** com foco em seguranca, escalabilidade e
manutencao. Mantem 100% das funcionalidades do sistema original e roda
**isolado da producao** (porta, containers, rede e volumes proprios), seguindo
o padrao Strangler Fig: a base e um espelho fiel do `autoflow_cadence` e as
melhorias entram de forma incremental, validadas a cada passo.

> Producao (`autoflow_cadence`) continua intacta na porta 4050.
> Esta versao (`autoflow_epico`) sobe na porta **6060**.

---

## O que muda em relacao a producao

### 1. Seguranca
- **CORS com allowlist** (`backend/api/src/cors.js`): substitui o `cors()` aberto.
  As origens permitidas vem da variavel `CORS_ORIGINS` (lista separada por
  virgula). Sem valor, aceita apenas same-origin (via proxy nginx).
- **Controle de acesso por papel / RBAC** (`backend/api/src/auth.js`):
  - `viewer` -> leitura (GET)
  - `operator` -> escrita (POST/PUT/DELETE)
  - `admin` -> operacoes sensiveis (backup/restore)
  - Aplicado de forma centralizada a todas as rotas `/api`. Login e o webhook
    interno do gateway sao isentos (tem fluxo proprio).
- `JWT_SECRET` agora e obrigatorio: a API recusa requisicoes se ele nao estiver
  configurado, em vez de assinar tokens com segredo vazio.

### 2. Correcao de bug — auto-reply nao bloqueia mais o webhook
Antes, `/internal/message` segurava a requisicao HTTP do gateway por 12-20s
(um `setTimeout` dentro do handler) antes de responder. Agora o webhook
**responde na hora** e enfileira um job `send-auto-reply` (com o mesmo atraso
humano) processado pelo `worker`. Isso evita travar a conexao do gateway e
torna o envio resiliente a falhas (retry pela fila).

### 3. Isolamento de infraestrutura
| Recurso        | Producao (cadence) | Epico            |
|----------------|--------------------|------------------|
| Porta web      | 4050               | **6060**         |
| Containers     | `afcad_*`          | `afepico_*`      |
| Rede           | `afcad-net`        | `afepico-net`    |
| Volumes        | `afcad_*`          | `afepico_*`      |

Como os volumes e a sessao de WhatsApp sao proprios, as duas stacks rodam na
mesma VPS sem compartilhar banco, fila nem sessao.

### 4. Higiene de repositorio
- `.gitignore` (evita commitar `node_modules`, `.env`, sessao do WhatsApp, backups).
- `.env.example` com placeholders e instrucoes (nenhum segredo real versionado).

---

## Variaveis de ambiente

Use o `.env.example` como base. Principais:

| Variavel              | Descricao                                              |
|-----------------------|--------------------------------------------------------|
| `JWT_SECRET`          | **Obrigatorio.** Gere com `openssl rand -hex 32`.      |
| `ADMIN_EMAIL`         | E-mail do admin inicial.                               |
| `ADMIN_PASSWORD`      | Senha inicial — **troque apos o 1o login**.            |
| `CORS_ORIGINS`        | Origens permitidas (ex.: `https://app.seudominio.com`).|
| `MONGO_URL`           | Conexao Mongo (interna).                               |
| `REDIS_HOST`          | Host do Redis (interna).                               |
| `WA_GATEWAY_URL`      | URL interna do gateway.                                |
| `MIN_MESSAGE_DELAY_MS`| Atraso minimo anti-bloqueio entre envios.             |
| `JITTER_MS`           | Variacao aleatoria somada ao atraso.                  |

> Os segredos tem padroes embutidos no `docker-compose.yml` apenas para subir.
> **Troque-os antes de uso real.**

---

## Deploy

### Opcao A — Hostinger (Gerenciador Docker -> Compose por URL)
1. hPanel -> Gerenciador Docker -> Criar -> Compose.
2. Cole a URL raw do compose:
   `https://github.com/ricieri30/autoflow_epico/blob/main/docker-compose.yml`
3. Nome do projeto: `autoflow_epico` -> Implantar.
4. Apos subir, acesse `http://SEU_IP:6060`.

### Opcao B — VPS por terminal
```
git clone https://github.com/ricieri30/autoflow_epico.git
cd autoflow_epico
docker compose up -d --build
```

### Primeiro acesso
- URL: `http://SEU_IP:6060`
- Login inicial: `admin@admin.com` / `admin123` (troque na aba Conta).
- Va em WhatsApp e escaneie o QR Code.

> Sessao de WhatsApp: 1 numero = 1 sessao ativa. Para testar sem afetar a
> producao, use um numero dedicado.

---

## Arquitetura

Mesma da producao (6 servicos em Docker Compose), com os nomes isolados:
`afepico_web` (nginx + SPA React/Vite, porta 6060), `afepico_api` (Express +
JWT + RBAC), `afepico_worker` (BullMQ — envios com atraso + auto-reply),
`afepico_gateway` (Baileys — sessao WhatsApp), `afepico_mongo` (mongo:6),
`afepico_redis` (redis:7).

## Roadmap de migracao (Strangler Fig)
- [x] Espelho fiel da producao
- [x] Ajuste 1 — Seguranca (CORS allowlist + RBAC)
- [x] Ajuste 3 — Correcao do auto-reply (fila em vez de bloquear webhook)
- [x] Isolamento de infraestrutura (porta 6060 + prefixo afepico_)
- [ ] Ajuste 2 — Validacao de entrada (Zod) nas rotas de escrita
- [ ] Ajuste 4 — Multi-tenant (`tenantId`) + indices/paginacao

## Stack
Node.js 20 - Express - MongoDB 6 - Redis 7 - BullMQ - Baileys - React 18 -
Vite - Tailwind CSS - nginx - Docker Compose.
