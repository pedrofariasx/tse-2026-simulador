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

# Top 150 battleground municipalities
top_muns = []
for m in bg.get("top", [])[:150]:
    top_muns.append({
        "nome": m["nome"],
        "uf": m["uf"],
        "vv": m["vv"],
        "aptos": m["aptos"],
        "part": round(m["part"], 1),
        "lula_1t": m["lula"],
        "flav_1t": m["flav"],
        "m1p": round(m["m1p"], 1),
        "prot": m["prot"],
        "caiado": m["caiado"],
        "outp": round(m["outp"], 1)
    })

# State summary
ufs_summary = []
for u in sim["uf"]:
    ufs_summary.append({
        "uf": u["uf"].upper(),
        "nome": u["nome"],
        "vv": u["vv"],
        "r1_lula_pct": round(u["r1p"], 1),
        "r1_flav_pct": round(100 - u["r1p"], 1),
        "r1_margem": round(u["r1"] * 100, 1),
        "comp_1t": round(u["comp"], 1),
        "p_lula_2t": round(u["pL"] * 100, 1)
    })

dashboard_data = {
    "br": {
        "atualizado": BR["atualizado"],
        "pct_secoes": BR["pct_secoes"],
        "vv": BR["vv"],
        "branco": BR["branco"],
        "nulo": BR["nulo"],
        "aptos": BR["aptos"],
        "comparecimento": BR["comparecimento"],
        "pct_comp": BR["pct_comparecimento"]
    },
    "candidatos": [
        {
            "chave": c["chave"],
            "nome": c["nome"],
            "partido": c["partido"],
            "num": c["num"],
            "votos": c["votos_br"],
            "pct": round(c["votos_br"] / BR["vv"] * 100, 2),
            "chapa": c["chapa"]
        } for c in cands
    ],
    "pesos": deep["pesos"],
    "clusters": deep["clusters"],
    "elasticidade": deep["elasticidade_regional"],
    "grid_2d": deep["grid_2d"],
    "protest_steps": deep["protest_steps"],
    "flav_steps": deep["flav_steps"],
    "breakeven": {
        "beProtest": round(be["beProtest"] * 100, 1),
        "beFlavio": round(be["beFlavio"] * 100, 1),
        "beCaiado": round(be["beCaiado"] * 100, 1),
        "beBN": round(be["beBN"] * 100, 1),
        "beAll": round(be["beAll"] * 100, 1)
    },
    "ufs": ufs_summary,
    "top_muns": top_muns
}

js_content = "window.TSE_DATA = " + json.dumps(dashboard_data, indent=2, ensure_ascii=False) + ";\n"

with open("dashboard/data.js", "w", encoding="utf-8") as f:
    f.write(js_content)

print(f"Exported dashboard/data.js ({os.path.getsize('dashboard/data.js'):,} bytes)")
