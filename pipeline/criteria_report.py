"""
Pré-avaliação dos critérios de elegibilidade (IC/EC) pelas regras do protocolo.

Aplica as mesmas regras automáticas configuradas na Bancada PRISMA (ano,
idioma, tipo de documento, termos, bloco da string, string completa) a um
ou mais CSVs de registros e grava, para cada registro e critério:

    S  = atende (IC) ou se aplica (EC)
    N  = não atende (IC) ou não se aplica (EC)
    ?  = indeterminado (falta dado, por exemplo registro sem resumo)

junto com o trecho que justifica a avaliação. Nada é excluído aqui: o
relatório serve para conferir as regras antes da triagem e para ajustar o
protocolo. A decisão continua com os revisores, na Bancada.

Uso:
    python pipeline/criteria_report.py                       # usa data/raw/*_bancada.csv
    python pipeline/criteria_report.py data/raw/arquivo.csv  # um ou mais arquivos

Saídas:
    data/processed/criteria_report.csv          um registro por linha
    data/processed/criteria_report_summary.csv  contagens por critério
"""

import csv
import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import protocol as P

OUT = os.path.join("data", "processed", "criteria_report.csv")
OUT_SUMMARY = os.path.join("data", "processed", "criteria_report_summary.csv")

FIELD_COLS = {"title": "title", "abstract": "abstract", "keywords": "keywords"}


def term_regex(terms):
    parts = []
    for t in sorted({t.strip().strip('"') for t in terms if len(t.replace("*", "").strip()) > 1}, key=len, reverse=True):
        esc = re.escape(t).replace(r"\*", r"[\w-]*")
        esc = re.sub(r"(\\ )+", r"[\\s-]+", esc)
        parts.append(esc)
    if not parts:
        return None
    return re.compile(r"(?<!\w)(" + "|".join(parts) + r")(?!\w)", re.IGNORECASE)


def snippet(text, start, length):
    a, b = max(0, start - 50), min(len(text), start + length + 50)
    return ("…" if a else "") + re.sub(r"\s+", " ", text[a:b]) + ("…" if b < len(text) else "")


def find_in(row, rx, fields):
    for f in fields:
        txt = row.get(FIELD_COLS[f], "") or ""
        m = rx.search(txt)
        if m:
            return f, m.group(1), snippet(txt, m.start(), len(m.group(1)))
    return None


def rule_fields(rule):
    f = rule.get("fields") or {"title": True, "abstract": True, "keywords": True}
    sel = [k for k in ("title", "abstract", "keywords") if f.get(k)]
    return sel or ["title", "abstract", "keywords"]


def lang_ok(lg, langs):
    low = lg.lower()
    for a in langs:
        a = a.lower()
        if a in low:
            return True
        if a in ("english", "inglês", "ingles") and re.match(r"^(en|eng)\b", low):
            return True
    return False


def eval_rule(rule, row, p, kind):
    """Retorna (valor, evidência) ou None se o critério é manual."""
    t = (rule or {}).get("type") or "none"
    if t == "none":
        return None
    objective = t in ("year", "lang", "doctype")

    def flip(cond, ev):
        if cond is None:
            return "?", ev
        if kind == "ic":
            return ("S" if cond else "N"), ev
        if objective:
            return ("N" if cond else "S"), ev
        return ("S" if cond else "N"), ev

    if t == "year":
        try:
            y = int(str(row.get("year", "")).strip()[:4])
        except ValueError:
            return flip(None, "ano não informado")
        yf, yt = P.year_from(p), P.year_to(p)
        return flip(not ((yf and y < yf) or (yt and y > yt)), f"ano {y}")
    if t == "lang":
        lg = row.get("language", "") or ""
        if not lg:
            return flip(None, "idioma não informado pela base")
        langs = [x.strip() for x in (rule.get("values") or p.get("langs") or "English").split(",") if x.strip()]
        return flip(lang_ok(lg, langs), f"idioma: {lg}")
    if t == "doctype":
        ty = row.get("doc_type", "") or ""
        if not ty:
            return flip(None, "tipo não informado pela base")
        ok = [x.strip().lower() for x in (rule.get("values") or "article, journal, conference, inproceedings, proceedings paper").split(",") if x.strip()]
        return flip(any(o in ty.lower() for o in ok), f"tipo: {ty}")

    if t == "terms":
        groups = [[x.strip() for x in re.split(r"\n|;", rule.get("terms") or "") if x.strip()]]
    elif t == "block":
        blocks = p.get("blocks") or []
        i = int(rule.get("block") or 0)
        groups = [P.terms_of(blocks[i])] if i < len(blocks) else []
    elif t == "string":
        groups = [P.terms_of(b) for b in (p.get("blocks") or [])]
    else:
        return None
    groups = [g for g in groups if g]
    if not groups:
        return None
    fs = rule_fields(rule)
    hits = []
    for g in groups:
        rx = term_regex(g)
        h = rx and find_in(row, rx, fs)
        if not h:
            missing_abs = "abstract" in fs and not (row.get("abstract") or "").strip()
            if missing_abs:
                return flip(None, "nenhum termo no título; registro sem resumo")
            return flip(False, "nenhum termo encontrado em " + ", ".join(P.FIELD_NAMES[f] for f in fs))
        hits.append(h)
    return flip(True, " | ".join(f"“{term}” no {P.FIELD_NAMES[f]}: {snip}" for f, term, snip in hits))


def main(paths):
    p = P.load()
    crits = [("ic", c) for c in P.criteria("ic", p)] + [("ec", c) for c in P.criteria("ec", p)]
    auto = [(k, c) for k, c in crits if (c.get("rule") or {}).get("type", "none") != "none"]
    if not auto:
        raise SystemExit("Nenhum critério com regra automática no protocolo. Configure as regras na Bancada.")
    rows = []
    for path in paths:
        with open(path, encoding="utf-8-sig") as f:
            rows.extend(csv.DictReader(f))
    print(f"{len(rows)} registros em {len(paths)} arquivo(s); {len(auto)} critérios automáticos.")

    counts = {c["c"]: {"S": 0, "N": 0, "?": 0} for _, c in auto}
    out_rows = []
    for row in rows:
        out = {k: row.get(k, "") for k in ("source_db", "title", "year", "doi")}
        for kind, c in auto:
            v, ev = eval_rule(c["rule"], row, p, kind)
            counts[c["c"]][v] += 1
            out[c["c"]] = v
            out[c["c"] + "_evidencia"] = ev
        out_rows.append(out)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fields = ["source_db", "title", "year", "doi"] + [x for _, c in auto for x in (c["c"], c["c"] + "_evidencia")]
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(out_rows)
    with open(OUT_SUMMARY, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["criterio", "tipo", "regra", "S (atende/aplica)", "N", "? (indeterminado)"])
        for kind, c in auto:
            n = counts[c["c"]]
            w.writerow([c["c"], kind.upper(), c["rule"]["type"], n["S"], n["N"], n["?"]])

    print("\nCritério  Regra      S       N       ?")
    for kind, c in auto:
        n = counts[c["c"]]
        print(f"{c['c']:<9} {c['rule']['type']:<9} {n['S']:>6}  {n['N']:>6}  {n['?']:>6}")
    print(f"\nDetalhe: {OUT}\nResumo:  {OUT_SUMMARY}")


if __name__ == "__main__":
    files = sys.argv[1:] or sorted(glob.glob(os.path.join("data", "raw", "*_bancada.csv")))
    if not files:
        raise SystemExit("Nenhum CSV informado e nenhum data/raw/*_bancada.csv encontrado. Rode os conectores antes.")
    main(files)
