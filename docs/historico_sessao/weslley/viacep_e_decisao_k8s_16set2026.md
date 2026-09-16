# Relatório de Sessão — 16/09/2026

**Data:** 16/09/2026
**Responsável:** Weslley (orquestrando Claude Code)
**Branch:** `feature/viacep-integration` (a partir de `origin/develop`)

---

## Objetivo da sessão

Ordem pedida: revisar infra existente + ADR-003 → implementar T-03.1 (ViaCEP) → decidir T-02.1
(serviço de Kubernetes + custo).

## O que foi feito

### 1. Revisão de infra e ADR-003 (sem mudança de código)

Soma dos `resources` declarados em `infra/k8s/` — hoje só o `core-service`:

| Componente | Réplicas | Requests (cpu/mem) | Limits (cpu/mem) |
|---|---|---|---|
| backend | 3 | 300m / 384Mi | 1500m / 1536Mi |
| postgres | 1 | 250m / 256Mi | 1000m / 1Gi |
| redis | 1 | 50m / 64Mi | 200m / 256Mi |
| minio | 1 | 100m / 128Mi | 500m / 512Mi |
| nginx | 1 | 50m / 64Mi | 200m / 128Mi |
| **Total** | | **~750m cpu / ~896Mi mem** | **~3.4 vCPU / ~3.4Gi** |

ADR-003 (14/09/2026, resumo em `docs/specs/SPEC-01-microsservicos.md` — texto formal no fork da
UniFAAT): recorte por consistência transacional em `core-service` (12 entidades + outbox),
`b2b-service` (5 entidades) e `analytics-service` (sem entidade própria); cada um com Postgres
próprio; `b2b-service → core-service` síncrono idempotente; `core-service → analytics-service` via
eventos RabbitMQ (outbox + DLQ). O split físico ainda não existe em código — só o layout
(`services/core-service/`) migrou em 15/09.

Essa revisão foi o insumo para a decisão do T-02.1 (abaixo): a conta de tamanho de instância não
pode mirar só o que existe hoje.

### 2. T-03.1 — Integração ViaCEP (concluída)

Endpoint `GET /address/:cep`, seguindo o mesmo padrão de inversão de dependência já usado no PIX
(`app/services/pix/`).

**Arquivos criados:**

| Arquivo | Propósito |
|---|---|
| `app/services/address/AddressProvider.js` | Contrato (`lookup(cep)`) |
| `app/services/address/errors.js` | `AddressNotFoundError`, `AddressServiceUnavailableError` |
| `app/services/address/ViaCepAddressProvider.js` | Implementação real — `fetch` nativo do Node 24, timeout de 5s via `AbortController` |
| `app/services/address/index.js` | Factory por `ADDRESS_PROVIDER` (default `viacep`), mesmo formato de `pix/index.js` |
| `app/Controllers/AddressApi/GetAddressController.js` | Valida CEP (8 dígitos → 400), mapeia erros do provider para 404/503 |
| `routes/apis/addressRouter.js` | `GET /:cep`, com `authMiddleware` + `tenantMiddleware` |
| `tests/address.test.js` | 6 casos, `fetch` mockado via `vi.stubGlobal` |

**Arquivos modificados:** `routes/router.js` (monta `/address`), `config/swagger.js` (schema
`Address` + path `/address/{cep}`).

**Testes:** suíte completa — **226 passed \| 1 skipped (17 arquivos)**, incluindo os 6 novos casos
(401 sem token, 400 CEP mal formado sem chamar a rede, 200 com endereço estruturado, 404 quando a
ViaCEP responde `{erro: true}`, 503 em falha de rede e em status não-2xx).

**Validação adicional contra a API real** (fora da suíte, chamando o provider direto): CEP
`01310100` → Avenida Paulista/Bela Vista/São Paulo/SP corretos; CEP `99999999` →
`AddressNotFoundError` como esperado.

**Decisão de desenho mantida da Spec:** a consulta é só apoio ao preenchimento — nenhum campo de
endereço foi adicionado a `GuestModel`/`CorporateClientModel`, o endereço continua texto livre.

**Fecha sozinha o critério 🔴 do Termo** de integração com API externa relevante ao negócio.

### 3. T-02.1 — Decisão de Kubernetes + custo (análise concluída)

**Isto não é código.** Confirmado com o usuário: a equipe tem **conta AWS nova, dentro da janela de
12 meses de free-tier**.

**Decisão: k3s em EC2 single-node — não EKS.**

| | EKS | k3s em EC2 |
|---|---|---|
| Control plane | **US$ 0,10/h ≈ US$ 73-74/mês fixo**, mesmo sem carga (pode subir a US$ 0,60/h após 14 meses de suporte padrão) — nunca é free-tier | Sem cobrança de control plane |
| Aderência à regra absoluta do projeto (sempre free-tier) | **Viola sozinho**, mesmo parado | Compatível |

**Tamanho da instância:** os `requests` de hoje (~896Mi) já quase enchem um `t3.micro` (1GiB), antes
do overhead do próprio k3s (200-500Mi) e antes de RabbitMQ + 2º/3º Postgres + Prometheus/Grafana
(T-02.4) entrarem.

| Cenário | Instância | 24/7 | Sobe/destrói por sessão (regra do projeto) |
|---|---|---|---|
| Fase inicial (T-02.2/T-02.3, só core-service) | `t3.micro` | US$ 0 (free-tier, 750h/mês) | US$ 0 |
| Após RabbitMQ + observabilidade (T-02.4) | `t3.small` (~US$ 0,034/h, sa-east-1) | ~US$ 24-25/mês — fora do free-tier | Centavos a poucos dólares/mês |

Preços de EC2/EKS confirmados via busca em 16/09/2026 (sa-east-1, on-demand).

**Ciclo de vida:** `terraform apply` no início de cada sessão de trabalho/demonstração,
`terraform destroy` ao final — já é regra absoluta do projeto, e vira ainda mais necessária quando a
instância sair do free-tier em `t3.small`.

#### Insumo para o ADR-004 (colar no fork da UniFAAT)

> **Contexto:** o Termo exige deploy em nuvem pública com IaC via Terraform, sempre dentro do
> free-tier. O footprint atual de `infra/k8s/` (só `core-service`) já soma ~896Mi de requests; o
> ADR-003 projeta mais 2 bancos Postgres, RabbitMQ e (SPEC-02 T-02.4) Prometheus+Grafana.
>
> **Alternativas consideradas:**
> 1. **EKS** — descartada: control plane gerenciado custa ~US$ 73-74/mês fixo, mesmo sem carga,
>    nunca é free-tier. Viola a regra absoluta do projeto por si só.
> 2. **k3s em EC2, instância única fixa dimensionada para o alvo final** — descartada por ora:
>    dimensionar hoje para o pico (3 serviços + broker + observabilidade) sairia do free-tier antes
>    da hora.
> 3. **k3s em EC2, faseado (`t3.micro` → `t3.small`)** — escolhida.
>
> **Decisão:** k3s single-node em EC2. Começar em `t3.micro` (free-tier) para a fase
> core-service-only (T-02.2/T-02.3); migrar para `t3.small` quando RabbitMQ e observabilidade
> entrarem (T-02.4). Backend deixa de rodar com 3 réplicas (ajuste de `minikube`, não faz sentido em
> nó único de 1 vCPU).
>
> **Consequências:** a fase final roda fora do free-tier (`t3.small`, ~US$ 24-25/mês se ligado
> 24/7). Mitigado pela regra de ciclo de vida efêmero já adotada pelo projeto — `terraform apply`
> por sessão, `terraform destroy` ao final — o que reduz o custo real a centavos por uso, e é também
> o que já justifica o Docker Compose de contingência (T-06.4) como plano B para o dia da defesa.

---

## Testes

`npm test` (suíte completa) — **226 passed \| 1 skipped (17 arquivos)**.

## Commits (branch `feature/viacep-integration`)

1. `feat(address): adiciona provider ViaCEP com contrato e factory`
2. `feat(address): endpoint GET /address/:cep com validacao e mapeamento de erros`
3. `docs(swagger): documenta endpoint de consulta de CEP`
4. `test(address): cobertura de sucesso, 400/404/503 com fetch mockado`

## Pendências para o próximo dev

- **ADR-004** — o conteúdo acima está pronto, mas precisa ser transcrito manualmente para
  `Projetos/gesway/07-registro-decisoes-arquitetonicas-adr.md` no fork da UniFAAT (fora deste
  repositório). CA-02.1.d continua em aberto até isso acontecer.
- **T-02.2** (módulos Terraform) depende de T-02.1 — pode começar já com a decisão acima.
- **T-03.2** (Mercado Pago sandbox) e **T-03.3** (ADR da integração PIX real) continuam não
  iniciadas — T-03.1 sozinha já fecha o critério do Termo, então não são bloqueantes.
- Nenhuma mudança em `GuestModel`/`CorporateClientModel` foi feita — decisão de desenho da própria
  Spec (endereço continua texto livre).
