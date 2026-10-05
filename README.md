# TSE 2026 — Raspagem Integral, Simulador Preditivo & Agente de IA

**Desenvolvido por Pedro Farias com Kilo Agentic Suite**

Raspagem completa da API do TSE para a **Presidência da República no 1º turno das Eleições Gerais de 2026**
(pleito `6257`, ciclo `ele2026`), com simulador Monte Carlo de transferência de votos, inferência espacial,
clusterização de 5.716 municípios e **agente de IA que lê notícias a cada hora**.

---

## 1. Resultado Preditivo

Apuração **fechada em 100%** (499.248 de 499.248 seções). O 2º turno **já está matematicamente definido** pelo TSE: **Flávio Bolsonaro (PL · 22) vs. Lula da Silva (PT · 13)**.

Base: 30.000 simulações Monte Carlo sobre 119.300.788 votos válidos · comparecimento 125.275.835 (78,92%).

| Candidato | 1º Turno (TSE 100%) | 2º Turno (Projeção Central) | Probabilidade de Vitória |
|---|---|---|---|
| **Flávio Bolsonaro (PL)** | **56.104.503** (47,03%) | **59.281.257** (51,16%) | **73,58%** |
| **Lula da Silva (PT)** | **53.879.538** (45,16%) | **56.590.401** (48,84%) | **26,42%** |
| **Vantagem Flávio** | **+2.224.965 votos** (+1,87 p.p.) | **+2.809.699 votos** (+2,42 p.p.) | IC90: [−9.63M a +4.69M] |

- Relatório completo: [`reports/analise-2026.md`](reports/analise-2026.md)
- Simulador interativo: [`dashboard/index.html`](dashboard/index.html)

---

## 2. Rodando o servidor

```bash
npm install
npm start           # http://localhost:3000
```

O dashboard é responsivo e foi auditado com Playwright em telas de 375 a 1920 px
(detalhes na seção 8).

O servidor sobe com o dashboard e o agente de IA já ativo.

### Endpoints HTTP

| Rota                       | Método | O que faz                                 |
| -------------------------- | ------ | ----------------------------------------- |
| `/`                        | GET    | Dashboard interativo                      |
| `/api/health`              | GET    | Health check (usado pelo Render)          |
| `/api/ai-analysis`         | GET    | Última análise de notícias (cache de 1 h) |
| `/api/ai-analysis/refresh` | POST   | Força nova coleta + análise (~20 s)       |
| `/api/data`                | GET    | Dataset completo do TSE em JSON           |
| `/api/simulate`            | POST   | Calcula o 2º turno no servidor            |

Exemplo:

```bash
curl -X POST http://localhost:3000/api/simulate \
  -H 'Content-Type: application/json' \
  -d '{"flavio_defection_pct": 8, "cury_to_lula_pct": 60}'
```

---

## 3. O agente de IA (notícias → ajuste de parâmetros)

A cada **1 hora** o servidor:

1. **Coleta notícias** de três ângulos via Google News RSS (`hl=pt-BR`), deduplica e fica com até 18 manchetes.
2. **Chama o modelo** `stepfun/step-3.7-flash:free` no endpoint
   `https://api.kilo.ai/api/gateway/v1/chat/completions`, pedindo JSON estrito com 9 parâmetros.
3. **Grava** em `data/processed/ai_news_analysis.json` e `dashboard/ai-analysis.json`.
4. O dashboard lê `/api/ai-analysis`, mostra a leitura do cenário, as manchetes, a justificativa
   e uma tabela **sugerido vs. central**. O botão **✨ Aplicar sugestão da IA** move os sliders.

### Variáveis de ambiente

| Variável                | Padrão                                                | Descrição                                                                        |
| ----------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `PORT`                  | `3000`                                                | Porta HTTP                                                                       |
| `UPDATE_INTERVAL_HOURS` | `1`                                                   | Intervalo do agente                                                              |
| `KILO_GATEWAY_URL`      | `https://api.kilo.ai/api/gateway/v1/chat/completions` | Endpoint OpenAI-compatível                                                       |
| `KILO_MODEL`            | `stepfun/step-3.7-flash:free`                         | Modelo usado                                                                     |
| `KILO_API_KEY`          | _(vazio)_                                             | Opcional. O endpoint aceita requisição sem chave; informe se sua conta usar BYOK |

Rodar uma única vez, sem servidor:

```bash
npm run ai:once
```

---

## 4. Deploy no Render

O repositório já tem [`render.yaml`](render.yaml) — no Render basta **New → Blueprint** e apontar para o repo.

- **Build command:** `npm ci --omit=dev`
- **Start command:** `npm start`
- Plano **free** funciona (o agente roda no próprio processo Node; não há cron separado).

Se preferir configurar pela UI: use os mesmos comandos e defina as variáveis da tabela acima.
Como o plano free hiberna após inatividade, a primeira resposta pode demorar ~1 min para "acordar".

---

## 5. O que a raspagem cobre

| Nível                        | Entidades | Requisições | Erros |
| ---------------------------- | --------- | ----------- | ----- |
| Nacional                     | 1         | 1           | 0     |
| Estadual (27 UFs + Exterior) | 28        | 28          | 0     |
| Municipal                    | 5.757     | 5.757       | 0     |
| Zona eleitoral               | 6.292     | 6.292       | 0     |
| **Total**                    |           | **12.078**  | **0** |

**Validação de integridade**

- Soma dos candidatos em BR = **119.300.788** votos válidos = total oficial (**divergência zero**)
- Soma das 28 UFs = **119.300.788** (**divergência zero**)
- Soma dos 5.757 municípios = −0,0079% (9.411 votos residuais)
- Soma das 6.292 zonas = −0,0138% (16.436 votos residuais)

### Endpoints do TSE

A API não é documentada. O padrão foi extraído do bundle lazy da SPA:

```
https://resultados.tse.jus.br/oficial/<ciclo>/<eleicao>/dados/<uf>/<stem>-c<cargo>-e<eleicao>-u.jws

<stem> = <uf>                              ->  sp
       | <uf><codigo TSE do municipio>     ->  sp61018
       | <uf><mun>-z<zona>                 ->  sp61018-z0157

sufixo:  -u   votos (unificado)      -ab   comparecimento por município/zona
config:  config/mun-e006257-cm.jws         lista completa de municípios e zonas
```

O payload é um **JWS (EdDSA)**. O JSON está no **segundo segmento** em base64url.

---

## 6. Reproduzir toda a análise

```bash
npm install
npm run scrape          # 12.078 requisições (~3 min, 0 erros, retomável)
npm run build           # normaliza, valida e exporta o CSV
npm run blocos          # inferência geográfica de transferibilidade
npm run model           # Monte Carlo (30k simulações) + sensibilidade
npm run breakeven       # pontos de equilíbrio
npm run deep            # clusterização municipal + matriz 2D + elasticidade
npm run battlegrounds   # municípios decisivos
npm run export-dashboard
npm run report
```

Ou tudo em sequência: `npm run pipeline`.

> `deep`, `export-dashboard` e `report` usam `python3`. Os demais são Node puro.

---

## 7. Como ler o dashboard

Seção **"Começando do zero"**, no topo, explica em linguagem simples:

- o que é o 1º e o 2º turno, e por que o 2º turno já está definido;
- por que a vantagem de 2,2 milhões de votos de Flávio engana — os **15 milhões de votos
  "soltos"** são quase 7× essa diferença;
- o que significam "voto de protesto", "desvio da base", "baluarte" e "pêndulo";
- como ler a matriz 2D e por que "favorito" **não** significa "vai ganhar".

Depois, o painel de sliders simula cenários em tempo real e a seção 🤖 mostra o que as
notícias estão dizendo e o que a IA sugere a partir delas.

---

## 8. Responsividade (mobile)

O dashboard é **mobile-first de fato**, verificado em Playwright em 6 viewports
(375 / 390 / 412 / 768 / 1280 / 1920 px):

| Ajuste                       | Antes                                       | Depois                                |
| ---------------------------- | ------------------------------------------- | ------------------------------------- |
| Rolagem horizontal da página | 428 px em tela de 375 (conteúdo estourando) | **0** — sem overflow                  |
| Altura do header no celular  | 178 px (27% da tela do iPhone SE)           | **105 px** (16%)                      |
| Área de toque dos sliders    | 6 px de altura                              | **38 px** (polegar 32 px)             |
| Alvos de toque < 32 px       | 18                                          | **0**                                 |
| Coluna fixa da matriz 2D     | 415 px (não cabia nenhuma coluna de dados)  | **135 px** (5 de 10 colunas visíveis) |

Detalhes:

- **Header** — empilha em celular com faixa de navegação rolável horizontal
  (com `snap`), volta a uma linha a partir de 768 px. Escrito em CSS puro
  (`.hdr-wrap` / `.hdr-title` / `.hdr-nav`) em vez de variantes do Tailwind,
  porque a largura disponível depende do texto do título.
- **Sliders** — trilha fina mas caixa de toque alta; `@media (pointer: coarse)`
  aumenta o alvo e o polegar só em telas de toque, sem engrossar no desktop.
- **Tabelas** — `min-width: max-content` + `overflow-x-auto` com sombra de borda
  (`.scroll-hint`) indicando que rolam. A primeira coluna da matriz fica fixa.
- **Âncoras** — `scroll-mt` nas seções para o header fixo não cobrir o título.
- Botão **"voltar ao topo"** aparece após 700 px de rolagem, só no mobile.
- `prefers-reduced-motion` desliga as transições.

Rodar a auditoria:

```bash
node src/audit_mobile.mjs    # mede overflow, alvos de toque e âncoras; salva screenshots
```

---

## 9. Limitações do modelo

1. **Não há dados de pesquisa.** As transferências são prioridades declaradas, não medições.
   O TSE removeu os dados de 2022 do site (só `ele2024` e `ele2026` estão disponíveis).
2. **A fração de Cury e Renan é uma aposta** — 6,1 milhões de votos, 2,7× a vantagem atual de Flávio.
3. **A coesão da base do Flávio é o parâmetro mais frágil** (primeira presidenciaria dele):
   o ponto de equilíbrio é 7,5% de desvio.
4. Absenteísmo seletivo não é observável em dados de 1º turno.
5. Geografia informa, mas não decide transferência; foi usada como _sanity check_.
6. A análise de IA é **sugestão**, não previsão — o modelo pode ler manchetes de forma rasa
   e não conhece pesquisa de rua, que é o que realmente decide um segundo turno no Brasil.

---

## 10. Arquivos

| Arquivo                                                                              | Descrição                                      |
| ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `dashboard/index.html`                                                               | Simulador + guia para leigos + seção de IA     |
| `dashboard/data.js`                                                                  | Dataset do TSE para o dashboard                |
| `dashboard/ai-analysis.json`                                                         | Último resultado do agente (fallback estático) |
| `src/server.mjs`                                                                     | Servidor Express + scheduler do agente         |
| `src/ai_agent.mjs`                                                                   | Coleta de notícias + chamada ao Kilo Gateway   |
| `src/scrape.mjs`                                                                     | Raspador com checkpoints e concorrência        |
| `src/build.mjs` · `blocos.mjs` · `model.mjs` · `breakeven.mjs` · `battlegrounds.mjs` | Pipeline de análise                            |
| `src/deep_analysis.py` · `export_dashboard_data.py` · `generate_full_report.py`      | Etapas Python                                  |
| `reports/analise-2026.md`                                                            | Relatório de inteligência                      |
| `data/processed/tse_2026_presidencia_1turno_completo.csv`                            | CSV com 114.421 linhas                         |
