import json
import os

with open("data/processed/geos.json", encoding="utf-8") as f:
    geos = json.load(f)

with open("data/processed/blocos_inferidos.json", encoding="utf-8") as f:
    inf = json.load(f)

BR = next(g for g in geos if g.get("nivel") == "br")
LULA = inf["LULA"]  # "13"
BOLS = inf["BOLS"]  # "22"

muns = [g for g in geos if g.get("nivel") == "mun" and g.get("vv", 0) > 0 and g.get("aptos", 0) > 0]
print(f"Loaded {len(muns)} municipalities with valid votes and electorate.")

# Macroregions
REG = {
    "norte": ["ac", "ap", "am", "ro", "rr", "to", "pa"],
    "nordeste": ["al", "ba", "ce", "ma", "pb", "pe", "pi", "rn", "se"],
    "centro": ["go", "mt", "ms", "df"],
    "sudeste": ["mg", "es", "rj", "sp"],
    "sul": ["pr", "sc", "rs"],
    "exterior": ["zz"]
}
uf_reg = {}
for r, ufs in REG.items():
    for u in ufs:
        uf_reg[u] = r

# -------------------------------------------------------------
# 1. MUNICIPAL CLUSTERING / ARCHETYPES
# -------------------------------------------------------------
# We categorize each municipality into 6 political archetypes:
# 1. "Baluarte Lulista": Lula >= 60%
# 2. "Baluarte Bolsonarista": Flávio >= 60%
# 3. "Swing / Pêndulo Competitivo": |Lula - Flávio| <= 10%
# 4. "Cinturão Caiadista": Caiado >= 10% (and not strong Baluarte)
# 5. "Cinturão de Protesto": (Cury + Renan) >= 8% (and not swing/baluarte)
# 6. "Intermediário / Demais"

clusters = {
    "baluarte_lula": {"nome": "Baluarte Lulista (Lula >= 60%)", "muns": [], "vv": 0, "aptos": 0, "lula": 0, "flav": 0, "prot": 0, "caiado": 0, "comp": 0},
    "baluarte_flav": {"nome": "Baluarte Bolsonarista (Flávio >= 60%)", "muns": [], "vv": 0, "aptos": 0, "lula": 0, "flav": 0, "prot": 0, "caiado": 0, "comp": 0},
    "swing":         {"nome": "Pêndulo Competitivo (|Margem| <= 10%)", "muns": [], "vv": 0, "aptos": 0, "lula": 0, "flav": 0, "prot": 0, "caiado": 0, "comp": 0},
    "caiadista":     {"nome": "Cinturão Caiadista (Caiado >= 10%)", "muns": [], "vv": 0, "aptos": 0, "lula": 0, "flav": 0, "prot": 0, "caiado": 0, "comp": 0},
    "protesto":      {"nome": "Foco de Protesto (Cury+Renan >= 8%)", "muns": [], "vv": 0, "aptos": 0, "lula": 0, "flav": 0, "prot": 0, "caiado": 0, "comp": 0},
    "intermediario": {"nome": "Intermediário / Demais", "muns": [], "vv": 0, "aptos": 0, "lula": 0, "flav": 0, "prot": 0, "caiado": 0, "comp": 0},
}

for m in muns:
    vv = m["vv"]
    l = m["v"].get(LULA, 0)
    b = m["v"].get(BOLS, 0)
    cai = m["v"].get("55", 0)
    prot = m["v"].get("70", 0) + m["v"].get("14", 0)
    pct_l = l / vv
    pct_b = b / vv
    pct_cai = cai / vv
    pct_prot = prot / vv

    # Assign cluster
    if pct_l >= 0.60:
        c_id = "baluarte_lula"
    elif pct_b >= 0.60:
        c_id = "baluarte_flav"
    elif abs(pct_l - pct_b) <= 0.10:
        c_id = "swing"
    elif pct_cai >= 0.10:
        c_id = "caiadista"
    elif pct_prot >= 0.08:
        c_id = "protesto"
    else:
        c_id = "intermediario"

    cl = clusters[c_id]
    cl["muns"].append(m["municipio"])
    cl["vv"] += vv
    cl["aptos"] += m["aptos"]
    cl["lula"] += l
    cl["flav"] += b
    cl["prot"] += prot
    cl["caiado"] += cai
    cl["comp"] += m["comparecimento"]

cluster_summary = []
for c_id, c_data in clusters.items():
    tot_vv = c_data["vv"]
    aptos = c_data["aptos"]
    turnout = (c_data["comp"] / aptos * 100) if aptos else 0
    p_l = (c_data["lula"] / tot_vv * 100) if tot_vv else 0
    p_b = (c_data["flav"] / tot_vv * 100) if tot_vv else 0
    cluster_summary.append({
        "id": c_id,
        "nome": c_data["nome"],
        "num_municipios": len(c_data["muns"]),
        "votos_validos": tot_vv,
        "pct_eleitorado_nacional": (tot_vv / BR["vv"] * 100),
        "comparecimento_pct": turnout,
        "lula_votos": c_data["lula"],
        "lula_pct": p_l,
        "flavio_votos": c_data["flav"],
        "flavio_pct": p_b,
        "margem_lula_flavio": c_data["lula"] - c_data["flav"],
        "protesto_votos": c_data["prot"],
        "protesto_pct": (c_data["prot"] / tot_vv * 100) if tot_vv else 0,
        "caiado_votos": c_data["caiado"],
        "caiado_pct": (c_data["caiado"] / tot_vv * 100) if tot_vv else 0,
    })

print("\n=== CLUSTER SUMMARY ===")
for c in cluster_summary:
    print(f"{c['nome']:45} | Muns: {c['num_municipios']:4} | Válidos: {c['votos_validos']:,} ({c['pct_eleitorado_nacional']:.1f}%) | Lula: {c['lula_pct']:.1f}% | Flávio: {c['flavio_pct']:.1f}% | Prot: {c['protesto_pct']:.1f}%")

# -------------------------------------------------------------
# 2. TURNOUT ELASTICITY BY REGION
# -------------------------------------------------------------
# If turnout in a region changes by +1.0 p.p. or -1.0 p.p. in R2,
# how many net votes are gained or lost by Lula and Flávio?
reg_totals = {}
for m in muns:
    reg = uf_reg.get(m["uf"].lower(), "outros")
    if reg not in reg_totals:
        reg_totals[reg] = {"aptos": 0, "vv": 0, "comp": 0, "lula": 0, "flav": 0}
    reg_totals[reg]["aptos"] += m["aptos"]
    reg_totals[reg]["vv"] += m["vv"]
    reg_totals[reg]["comp"] += m["comparecimento"]
    reg_totals[reg]["lula"] += m["v"].get(LULA, 0)
    reg_totals[reg]["flav"] += m["v"].get(BOLS, 0)

elasticity_reg = []
for reg, d in reg_totals.items():
    curr_turnout = d["comp"] / d["aptos"] if d["aptos"] else 0
    pct_lula_in_reg = d["lula"] / d["vv"] if d["vv"] else 0
    pct_flav_in_reg = d["flav"] / d["vv"] if d["vv"] else 0
    # 1 p.p. increase in turnout = 0.01 * aptos more voters
    # Assuming valid vote fraction remains ~ (vv/comp)
    valid_ratio = d["vv"] / d["comp"] if d["comp"] else 0.95
    voters_per_pp = 0.01 * d["aptos"] * valid_ratio
    delta_lula = voters_per_pp * pct_lula_in_reg
    delta_flav = voters_per_pp * pct_flav_in_reg
    net_swing_lula = delta_lula - delta_flav

    elasticity_reg.append({
        "regiao": reg.upper(),
        "aptos": d["aptos"],
        "comparecimento_1t": curr_turnout * 100,
        "votos_validos": d["vv"],
        "lula_pct": pct_lula_in_reg * 100,
        "flavio_pct": pct_flav_in_reg * 100,
        "votos_validos_por_1pp": round(voters_per_pp),
        "ganho_lula_por_1pp": round(delta_lula),
        "ganho_flavio_por_1pp": round(delta_flav),
        "saldo_liquido_lula_por_1pp": round(net_swing_lula)
    })

print("\n=== TURNOUT ELASTICITY (Saldo Líquido para Lula por +1 p.p. de Comparecimento) ===")
for el in sorted(elasticity_reg, key=lambda x: x["saldo_liquido_lula_por_1pp"], reverse=True):
    print(f"Região {el['regiao']:12} | Aptos: {el['aptos']:,} | Comp: {el['comparecimento_1t']:.1f}% | L:{el['lula_pct']:.1f}% F:{el['flavio_pct']:.1f}% | Saldo Lula por +1 p.p.: {el['saldo_liquido_lula_por_1pp']:+,}")

# -------------------------------------------------------------
# 3. 2D SENSITIVITY GRID (DECISION SURFACE)
# -------------------------------------------------------------
# X: Protest vote to Lula (20% to 80% in steps of 5%)
# Y: Defection rate of Flávio's 1T base to Lula (2% to 12% in steps of 1%)
# All other parameters held at their central values:
# - Caiado (PSD): 11.4% to Lula, 88.6% to Flávio (activation 91.5%)
# - Zema (NOVO): 8.3% to Lula, 91.7% to Flávio (activation 90%)
# - Left fringe: 94% to Lula (activation 93.5%)
# - DC/Democrata: 48.8% to Lula (activation 86%)
# - Blank: activation 28%, 31% to Lula
# - Null: activation 60%, 33.2% to Lula
# - Lula base: activation 96.5%, 97.5% retention (2.5% defection to Flávio)
# - Flávio base: activation 95.8%, (1 - defection) to Flávio, defection to Lula

weights = {
    "lula": next(c["votos"] for c in inf["candidatos"] if c["chave"] == LULA),
    "flav": next(c["votos"] for c in inf["candidatos"] if c["chave"] == BOLS),
    "cury": next(c["votos"] for c in inf["candidatos"] if c["chave"] == "70"),
    "renan": next(c["votos"] for c in inf["candidatos"] if c["chave"] == "14"),
    "caiado": next(c["votos"] for c in inf["candidatos"] if c["chave"] == "55"),
    "zema": next(c["votos"] for c in inf["candidatos"] if c["chave"] == "30"),
    "esq": sum(c["votos"] for c in inf["candidatos"] if c["chave"] in ["16", "21", "80", "29"]),
    "dc": sum(c["votos"] for c in inf["candidatos"] if c["chave"] in ["27", "35"]),
    "branco": BR["branco"],
    "nulo": BR["nulo"]
}

prot_pool = weights["cury"] + weights["renan"]
act_prot = 0.72  # average activation of protest pool

def simulate_point(protest_to_lula, flav_defection_to_lula):
    # Lula base
    act_lula = weights["lula"] * 0.965
    lula_from_lula = act_lula * 0.975
    flav_from_lula = act_lula * 0.025

    # Flávio base
    act_flav = weights["flav"] * 0.958
    lula_from_flav = act_flav * flav_defection_to_lula
    flav_from_flav = act_flav * (1.0 - flav_defection_to_lula)

    # Protest pool (Cury + Renan)
    act_protest = prot_pool * act_prot
    lula_from_prot = act_protest * protest_to_lula
    flav_from_prot = act_protest * (1.0 - protest_to_lula)

    # Caiado
    act_caiado = weights["caiado"] * 0.915
    lula_from_caiado = act_caiado * 0.114
    flav_from_caiado = act_caiado * 0.886

    # Zema
    act_zema = weights["zema"] * 0.900
    lula_from_zema = act_zema * 0.083
    flav_from_zema = act_zema * 0.917

    # Left fringe
    act_esq = weights["esq"] * 0.935
    lula_from_esq = act_esq * 0.940
    flav_from_esq = act_esq * 0.060

    # DC / Dem
    act_dc = weights["dc"] * 0.860
    lula_from_dc = act_dc * 0.488
    flav_from_dc = act_dc * 0.512

    # Blank
    act_br = weights["branco"] * 0.280
    lula_from_br = act_br * 0.310
    flav_from_br = act_br * 0.690

    # Null
    act_nl = weights["nulo"] * 0.600
    lula_from_nl = act_nl * 0.332
    flav_from_nl = act_nl * 0.668

    tot_lula = (lula_from_lula + lula_from_flav + lula_from_prot + lula_from_caiado +
                lula_from_zema + lula_from_esq + lula_from_dc + lula_from_br + lula_from_nl)
    tot_flav = (flav_from_lula + flav_from_flav + flav_from_prot + flav_from_caiado +
                flav_from_zema + flav_from_esq + flav_from_dc + flav_from_br + flav_from_nl)

    margin = tot_lula - tot_flav
    tot_valid = tot_lula + tot_flav
    pct_lula = (tot_lula / tot_valid) * 100
    pct_flav = (tot_flav / tot_valid) * 100

    return {
        "lula_votes": round(tot_lula),
        "flav_votes": round(tot_flav),
        "margin": round(margin),
        "pct_lula": round(pct_lula, 2),
        "pct_flav": round(pct_flav, 2),
        "winner": "Lula" if margin > 0 else "Flávio"
    }

protest_steps = [0.20, 0.30, 0.40, 0.45, 0.50, 0.55, 0.60, 0.70, 0.80]
flav_steps = [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.076, 0.08, 0.09, 0.10, 0.12]

grid_2d = []
for f_def in flav_steps:
    row = {"flav_defection_pct": round(f_def * 100, 1), "cells": []}
    for p_tr in protest_steps:
        sim_res = simulate_point(p_tr, f_def)
        row["cells"].append({
            "protest_to_lula_pct": round(p_tr * 100),
            "margin_votes": sim_res["margin"],
            "pct_lula": sim_res["pct_lula"],
            "pct_flav": sim_res["pct_flav"],
            "winner": sim_res["winner"]
        })
    grid_2d.append(row)

# -------------------------------------------------------------
# 4. EXPORT DEEP ANALYSIS PACKAGE
# -------------------------------------------------------------
deep_analysis = {
    "clusters": cluster_summary,
    "elasticidade_regional": elasticity_reg,
    "grid_2d": grid_2d,
    "protest_steps": [round(p * 100) for p in protest_steps],
    "flav_steps": [round(f * 100, 1) for f in flav_steps],
    "pesos": weights
}

out_path = "data/processed/deep_analysis.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(deep_analysis, f, indent=2, ensure_ascii=False)

print(f"\nSaved deep analysis to {out_path} ({os.path.getsize(out_path):,} bytes)")
