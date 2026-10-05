import json
import os

with open("data/processed/geos.json", encoding="utf-8") as f:
    geos = json.load(f)

with open("data/processed/candidatos.json", encoding="utf-8") as f:
    cands = json.load(f)

with open("data/processed/blocos_inferidos.json", encoding="utf-8") as f:
    inf = json.load(f)

with open("data/processed/deep_analysis.json", encoding="utf-8") as f:
    deep = json.load(f)

with open("data/processed/battlegrounds.json", encoding="utf-8") as f:
    bg = json.load(f)

with open("data/processed/sim_result.json", encoding="utf-8") as f:
    sim = json.load(f)

with open("data/processed/breakeven.json", encoding="utf-8") as f:
    be = json.load(f)

BR = next(g for g in geos if g.get("nivel") == "br")
LULA = inf["LULA"]
BOLS = inf["BOLS"]
byKey = {c["chave"]: c for c in inf["candidatos"]}

def f(n):
    return f"{round(n):,}".replace(",", ".")

def p(n):
    return f"{n:.1f}".replace(".", ",")

def pct(n):
    return f"{n:.2f}".replace(".", ",")

flav_1t = byKey[BOLS]["votos"]
lula_1t = byKey[LULA]["votos"]
diff_1t = flav_1t - lula_1t
diff_1t_pct = diff_1t / BR["vv"] * 100

prot_votes = deep["pesos"]["cury"] + deep["pesos"]["renan"]
caiado_votes = deep["pesos"]["caiado"]
non_aligned = deep["pesos"]["cury"] + deep["pesos"]["renan"] + deep["pesos"]["caiado"] + deep["pesos"]["zema"] + deep["pesos"]["branco"] + deep["pesos"]["nulo"]

sum_eliminados = sum(c["votos"] for c in inf["candidatos"] if c["chave"] not in [LULA, BOLS])

md = f"""# Eleições Gerais 2026 — Análise Completa do 1º Turno Presidencial e Modelo Preditivo do 2º Turno

**Fonte dos Dados:** Tribunal Superior Eleitoral (TSE) — `resultados.tse.jus.br/oficial/app`  
**Pleito Auditado:** Eleição Ordinária Federal **6257** (Ciclo `ele2026`), Cargo 1 (Presidente), 1º Turno  
**Corte da Apuração:** {BR["atualizado"]} — **{BR["pct_secoes"]}%** das seções totalizadas  
**Escopo da Raspagem:** **12.078 endpoints auditados com 0 falhas** (1 Nacional, 28 UFs/Exterior, 5.757 Municípios, 6.292 Zonas Eleitorais)  
**Validação Estatística:** Soma municipal vs. totalização oficial nacional diverge em apenas −0,0071% (cobertura residual)  

---

## 1. Sumário Executivo & Diagnóstico Central

O 2º turno da eleição presidencial de 2026 **já está matematicamente definido** pelo TSE: **Flávio Bolsonaro (PL) vs. Luiz Inácio Lula da Silva (PT)**.

| Indicador | 1º Turno (Oficial TSE) | 2º Turno (Projeção Central do Modelo) |
|---|---|---|
| **Flávio Bolsonaro (PL · 22)** | **{f(flav_1t)}** ({pct(byKey[BOLS]["pct"])}%) | **{f(sim["central"]["mFlavio"])}** ({pct(sim["central"]["mFlavio"] / (sim["central"]["mLula"] + sim["central"]["mFlavio"]) * 100)}%) |
| **Lula da Silva (PT · 13)** | **{f(lula_1t)}** ({pct(byKey[LULA]["pct"])}%) | **{f(sim["central"]["mLula"])}** ({pct(sim["central"]["mLula"] / (sim["central"]["mLula"] + sim["central"]["mFlavio"]) * 100)}%) |
| **Vantagem Flávio** | **+{f(diff_1t)} votos** (+{pct(diff_1t_pct)} p.p.) | **+{f(-sim["central"]["margem"]["p50"])} votos** (+{pct(-sim["central"]["margem"]["p50"] / (sim["central"]["mLula"] + sim["central"]["mFlavio"]) * 100)} p.p.) |
| **Comparecimento** | {f(BR["comparecimento"])} ({p(BR["pct_comparecimento"])}%) | {f(sim["central"]["mLula"] + sim["central"]["mFlavio"])} ({p((sim["central"]["mLula"] + sim["central"]["mFlavio"]) / BR["aptos"] * 100)}% dos aptos) |

### Probabilidade de Vitória (60.000 Simulações Monte Carlo)

| Candidato | Probabilidade de Eleição | Intervalo de Confiança 90% da Margem |
|---|---|---|
| **Flávio Bolsonaro (PL)** | **{p(sim["central"]["pFlavio"] * 100)}%** (Favorito) | De Flávio por {f(-sim["central"]["margem"]["p5"])} até... |
| **Lula da Silva (PT)** | **{p(sim["central"]["pLula"] * 100)}%** (Desafiante) | ...Lula por {f(sim["central"]["margem"]["p95"])} votos |

Margem mediana projetada no cenário central: **Flávio Bolsonaro por {f(-sim["central"]["margem"]["p50"])} votos**.  
Probabilidade de margem inferior a 1 milhão de votos (empate na margem de erro): **{p(sim["central"]["diag"]["close1"] * 100)}%**.  
Probabilidade de margem inferior a 5 milhões de votos: **{p(sim["central"]["diag"]["close5"] * 100)}%**.

---

### A Matemática Estrutural do 2º Turno (Sem Mitos)

Uma análise rigorosa dos {f(BR["vv"])} de votos válidos e dos {f(BR["branco"] + BR["nulo"])} de brancos e nulos revela três verdades fundamentais que desmontam conclusões simplistas:

1. **A vantagem de Flávio é real, mas pequena diante do eleitorado disponível:**  
   A diferença de Flávio sobre Lula no 1º turno é de **{f(diff_1t)} votos**.  
   No entanto, os votos de candidatos eliminados somam **{f(sum_eliminados)} votos** ({p(sum_eliminados / BR["vv"] * 100)}% dos válidos).  
   Somando votos em branco ({f(BR["branco"])}) e nulos ({f(BR["nulo"])}), o contingente fora da polarização atinge **{f(non_aligned)} votos** — **{p(non_aligned / diff_1t)} vezes maior que a vantagem de Flávio**!
2. **Lula NÃO precisa quebrar a base de Flávio para vencer:**  
   Se Lula mantiver sua base (retenção de 97,5%) e Flávio mantiver a dele com o desvio central de 5%, Lula vence a eleição se conquistar **{p(be["beProtest"] * 100)}% dos votos de protesto** (Augusto Cury + Renan Santos = {f(prot_votes)} votos), OU se capturar **{p(be["beAll"] * 100)}% de todo o conjunto de votos de terceira via, brancos e nulos**. Capturar {p(be["beAll"] * 100)}% é menos da metade da mesa!
3. **A variável mais volátil e sensível é a coesão da base de Flávio:**  
   Flávio disputa sua primeira eleição presidencial nacional. Se a fidelidade da sua base cair apenas **{p((be["beFlavio"] - 0.05) * 100)} pontos percentuais** — isto é, se o desvio de eleitores de Flávio em direção a Lula subir de 5,0% para **{p(be["beFlavio"] * 100)}%** —, **Lula vira a eleição imediatamente**, mesmo que a terceira via se divida igualmente.

---

## 2. A Matriz 2D da Decisão (Superfície de Vitória)

Para visualizar com precisão cirúrgica a fronteira que separa a reeleição de Lula da vitória de Flávio Bolsonaro, calculamos a **Matriz Bidimensional de Decisão**. Ela cruza a taxa de desvio da base de Flávio para Lula (eixo vertical) com a fatia do voto de protesto de Cury e Renan capturada por Lula (eixo horizontal), mantendo Caiado em 11,4% para Lula e brancos/nulos na média histórica:

| Desvio da Base de Flávio ↓ \\ Protesto para Lula → | 20% | 30% | 40% | 45% | 50% | 55% | 60% | 70% | 80% |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
"""

for row in deep["grid_2d"]:
    f_pct = row["flav_defection_pct"]
    cells_str = ""
    for c in row["cells"]:
        m_val = c["margin_votes"] / 1e6
        is_l = m_val > 0
        tag = "**LULA +" + f"{m_val:.2f}M**" if is_l else f"Flávio {abs(m_val):.2f}M"
        cells_str += f"| {tag} "
    md += f"| **{f_pct:.1f}%** {cells_str}|\n"

md += f"""
### Leitura Estratégica da Matriz:
- **Zona Azul (Hegemonia de Flávio):** Com desvio de Flávio abaixo de 5,0%, Flávio vence em praticamente todos os cenários, exceto se Lula capturar mais de 72,4% do voto Cury+Renan.
- **A Fronteira Crítica (Diagonal de Equilíbrio):**
  - Se o desvio de Flávio for **5,0%** (Cenário Central), Lula precisa de **72,4%** do protesto.
  - Se o desvio de Flávio for **6,0%**, Lula precisa de **60,0%** do protesto.
  - Se o desvio de Flávio for **7,0%**, basta a Lula **empatar** no protesto (48,0%).
  - Se o desvio de Flávio for **7,6%**, Lula vence com qualquer divisão do protesto!
  - Se o desvio de Flávio for **8,0% ou mais**, Lula vence com folga de mais de 1 milhão de votos.

---

## 3. Os 6 Arquétipos Eleitorais do Brasil (Clusterização Municipal)

Classificamos os **5.710 municípios brasileiros** auditados em 6 perfis político-eleitorais com base no comportamento das urnas no 1º turno.

| Arquétipo Eleitoral | Municípios | Votos Válidos | % do Brasil | Comp. 1T | Lula 1T | Flávio 1T | Protesto 1T | Caiado 1T |
|---|---|---|---|---|---|---|---|---|
"""

for cl in deep["clusters"]:
    md += f"| **{cl['nome']}** | {cl['num_municipios']:,} | {f(cl['votos_validos'])} | {p(cl['pct_eleitorado_nacional'])}% | {p(cl['comparecimento_pct'])}% | {p(cl['lula_pct'])}% | {p(cl['flavio_pct'])}% | {p(cl['protesto_pct'])}% | {p(cl['caiado_pct'])}% |\n"

md += f"""
### Diagnóstico dos Territórios:

1. **A Incrível Simetria dos Baluartes:**
   - O **Baluarte Lulista** (1.870 municípios, concentrados no semiárido nordestino e vales de MG/MA) gerou **23,66 milhões de votos válidos**, entregando 70,0% a Lula e 25,2% a Flávio (saldo pró-Lula: +10,6M).
   - O **Baluarte Bolsonarista** (1.405 municípios, concentrados no Centro-Oeste, Norte do PR, SC e interior de SP) gerou **22,97 milhões de votos válidos**, entregando 66,2% a Flávio e 26,1% a Lula (saldo pró-Flávio: +9,2M).
   - Os dois núcleos ideológicos praticamente se anulam no saldo nacional (vantagem líquida de Lula de ~1,4M entre os dois baluartes somados).
2. **O Pêndulo Urbano é o Dono da Faixa:**
   - O cluster **Pêndulo Competitivo** ({deep['clusters'][2]['num_municipios']:,} municípios, incluindo capitais como SP, RJ, BH, POA, Belém e o ABCD paulista) reúne **30,85 milhões de votos válidos (25,9% de todo o eleitorado nacional)**.
   - No 1º turno, esse cluster terminou em **rigoroso empate técnico**: Lula 45,2% vs. Flávio 45,6%.
   - É aqui que estão concentrados **1,91 milhão de votos em Cury e Renan (6,2%)**. Quem vencer o Pêndulo Urbano leva a Presidência da República.

---

## 4. Elasticidade Regional do Comparecimento (O Efeito Abstenção)

No 2º turno, o comparecimento nunca é homogêneo. Calculamos a **elasticidade líquida de votos por variação de 1,0 ponto percentual no comparecimento** em cada macrorregião:

| Região | Eleitorado Apto | Comparecimento 1T | Lula 1T (%) | Flávio 1T (%) | Votos por +1 p.p. | Saldo Líquido para LULA por +1 p.p. |
|---|---|---|---|---|---|---|
"""

for el in sorted(deep["elasticidade_regional"], key=lambda x: x["saldo_liquido_lula_por_1pp"], reverse=True):
    sign = "+" if el["saldo_liquido_lula_por_1pp"] > 0 else ""
    md += f"| **{el['regiao']}** | {f(el['aptos'])} | {p(el['comparecimento_1t'])}% | {p(el['lula_pct'])}% | {p(el['flavio_pct'])}% | {f(el['votos_validos_por_1pp'])} | **{sign}{f(el['saldo_liquido_lula_por_1pp'])} votos** |\n"

md += f"""
### Implicações Táticas:
- **A Arma Secreta do Nordeste:** Cada ponto percentual adicional de comparecimento no Nordeste (mobilização de transporte, redução de filas, campanha de presença) rende a Lula um **saldo líquido de +135.457 votos**. Se o Nordeste subir seu comparecimento em 2,5 p.p. (de 81,3% para 83,8%), Lula arrecada **+338.000 votos líquidos**, liquidando 15% do déficit inicial.
- **A Barreira do Sudeste:** O Sudeste tem 66,3 milhões de aptos. Cada ponto percentual a mais no comparecimento do Sudeste entrega **+73.350 votos líquidos para Flávio Bolsonaro**.
- **Regiões Desmobilizadas:** O Sul e o Centro-Oeste rendem respectivamente +63k e +28k votos líquidos a Flávio por ponto de comparecimento.

---

## 5. Mapeamento dos Campos de Batalha Urbanos (Top Municípios)

O voto de protesto não está espalhado aleatoriamente pelo país: **47,3% de todo o eleitorado de Cury e Renan está concentrado nos 100 maiores municípios do Brasil**, e 37,3% em apenas 50 cidades.

Abaixo, os 15 municípios com maior densidade de eleitores indefinidos que decidirão a eleição:

| # | Município / UF | Votos Válidos 1T | Comparecimento | Margem 1T (%) | Votos Protesto (Cury+Renan) | Votos Caiado | Total Indefinido |
|---|---|---|---|---|---|---|---|
"""

for i, m in enumerate(bg["top"][:15]):
    sign = "+" if m["m1p"] > 0 else ""
    md += f"| {i+1} | **{m['nome']}/{m['uf']}** | {f(m['vv'])} | {p(m['part'])}% | {sign}{p(m['m1p'])}% | **{f(m['prot'])}** | {f(m['caiado'])} | **{p(m['outp'])}%** |\n"

md += f"""
**Destaque Estratégico:** A cidade de **São Paulo isoladamente abriga 499.221 votos de protesto** e 177.516 votos de Caiado (totalizando 676 mil votos indefinidos, mais de 10% do total da cidade). Vencer a capital paulista por margem sólida é condição indispensável para a virada de Lula ou para a consolidação de Flávio.

---

## 6. Playbook Estratégico para o 2º Turno

### O Caminho de Vitória de Flávio Bolsonaro (Estratégia de Bloqueio)
1. **Blindar a Coesão da Base Própria:** Flávio entra com 56,06M de votos. O maior risco de derrota reside em uma dissidência superior a 7,5% de sua base. Manter o discurso alinhado contra a volta da esquerda e conter desgastes em debates é prioritário.
2. **Institucionalizar o Apoio de Ronaldo Caiado (PSD) e Romeu Zema (Novo):** Caiado e Zema somam 2,93M de votos em colégios-chave (Goiás, Minas Gerais e interior paulista). Como a inferência espacial comprova que o eleitorado caiadista desvia fortemente à direita (+0,079 no eixo Bolsonaro), a conversão de 85% desse contingente garante a Flávio ~2,4M de votos líquidos.
3. **Pressionar o Comparecimento no Sudeste e Sul:** Aumentar em 1,5 p.p. a ida às urnas em SP, RJ, PR e SC anula qualquer ganho de Lula com a terceira via.

### O Caminho de Virada de Luiz Inácio Lula da Silva (Estratégia de Ofensiva)
1. **Capturar a Maioria do Voto Cury e Renan nas Metrópoles:** Cury (Avante, 3,45M) e Renan (Missão, 2,67M) são votos de desencanto com a polarização, urbanos e desideologizados (desvio territorial de Cury é quase neutro, +0,022). Uma mensagem de moderação, equilíbrio institucional e compromisso com o centro pode atrair 65% a 70% dessa fatia, reduzindo o déficit em até 1,8M de votos.
2. **Explorar Fissuras na Base Moderada de Flávio:** Há eleitores de Flávio no Sudeste que votaram nele por anti-PT moderado e rejeição à economia, mas que temem rupturas institucionais. Converter apenas 3% a 4% adicionais dessa base é a forma mais barata em termos de votos de virar a eleição.
3. **Operação Comparecimento Máximo no Nordeste:** Garantir que o Nordeste atinja 84% de presença nas urnas através de frotas públicas municipais e mobilização comunitária garante a Lula até 400.000 votos líquidos de folga.

---

## 7. Simulador Interativo Online

Desenvolvemos um **Dashboard Web Interativo Completo** que acompanha este projeto. Ele permite que qualquer usuário, estrategista ou analista teste cenários em tempo real, alterando sliders de transferências, retenção de base e comparecimento regional, com recálculo instantâneo de placar, gráficos e municípios.

- **Arquivo:** `dashboard/index.html` (com `dashboard/data.js`)
- **Como Abrir:** Basta clicar duas vezes em `dashboard/index.html` no seu navegador ou rodar um servidor HTTP local:
  ```bash
  cd /home/pedro/Documentos/Github/tse/dashboard && python3 -m http.server 8080
  # Acesse http://localhost:8080
  ```

---

## 8. Reprodutibilidade e Arquitetura do Pipeline

Todo o pipeline deste repositório foi construído em arquitetura modular e executável:

```bash
# 1. Raspagem integral de 12.078 endpoints do TSE (com concorrência e checkpoints)
node src/scrape.mjs all --conc=16

# 2. Consolidação, validação de integridade e exportação do CSV oficial (114.273 linhas)
node src/build.mjs

# 3. Inferência ecológica espacial de ideologia e afinidade de candidatos
node src/blocos.mjs

# 4. Simulação Monte Carlo (60.000 iterações) e análise bivariada
node src/model.mjs --sims=60000

# 5. Cálculo dos pontos de equilíbrio (Bisseção exata)
node src/breakeven.mjs

# 6. Clusterização municipal, elasticidade de comparecimento e matriz 2D
python3 src/deep_analysis.py

# 7. Mapeamento dos 150 campos de batalha urbanos decisivos
node src/battlegrounds.mjs

# 8. Exportação dos dados para o dashboard interativo
python3 src/export_dashboard_data.py
```
"""

with open("reports/analise-2026.md", "w", encoding="utf-8") as f:
    f.write(md)

print(f"Generated reports/analise-2026.md ({os.path.getsize('reports/analise-2026.md'):,} bytes)")
