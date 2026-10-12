"""
Leitura do protocolo exportado pela Bancada PRISMA (protocolo.json).

O protocolo é a fonte da verdade da revisão: blocos da string de busca,
campos, janela de anos, idiomas, tipos de documento, critérios IC/EC (com
as regras automáticas) e questões de pesquisa com o livro de códigos.

Os conectores e o relatório de critérios leem tudo daqui. Para mudar a
busca ou um critério, edite na Bancada, exporte o protocolo.json de novo e
rode os scripts outra vez: nenhum código precisa ser alterado.

Caminho padrão: protocolo.json na raiz do projeto. Para usar outro arquivo,
defina a variável de ambiente PROTOCOL_PATH.
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PATH = os.path.join(PROJECT_ROOT, "protocolo.json")

FIELD_NAMES = {"title": "título", "abstract": "resumo", "keywords": "palavras-chave"}


def protocol_path() -> str:
    return os.getenv("PROTOCOL_PATH") or DEFAULT_PATH


def has_protocol() -> bool:
    return os.path.exists(protocol_path())


@lru_cache(maxsize=1)
def load() -> dict:
    path = protocol_path()
    if not os.path.exists(path):
        raise SystemExit(
            f"Protocolo não encontrado em {path}.\n"
            "Na Bancada PRISMA, aba Protocolo, clique em 'protocolo.json' e salve o "
            "arquivo na raiz do projeto (ou defina PROTOCOL_PATH)."
        )
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    # aceita tanto o protocolo puro quanto {"protocol": {...}}
    return data.get("protocol", data)


def _int_or_none(v):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def terms_of(block: dict) -> list[str]:
    raw = re.split(r"\n|;", block.get("terms") or "")
    return [t.strip().strip('"').strip() for t in raw if t.strip().strip('"').strip()]


def search_blocks(p: dict | None = None) -> dict[str, list[str]]:
    """Mesmo formato do SEARCH_BLOCKS original: {nome: [termos]}"""
    p = p or load()
    out = {}
    for i, b in enumerate(p.get("blocks") or []):
        terms = terms_of(b)
        if not terms:
            continue
        name = re.sub(r"[^a-z0-9]+", "_", (b.get("name") or f"bloco_{i+1}").lower()).strip("_") or f"bloco_{i+1}"
        out[name] = terms
    return out


def fields(p: dict | None = None) -> list[str]:
    p = p or load()
    f = p.get("fields") or {}
    sel = [k for k in ("title", "abstract", "keywords") if f.get(k, True)]
    return sel or ["title", "abstract", "keywords"]


def year_from(p: dict | None = None):
    return _int_or_none((p or load()).get("yearFrom"))


def year_to(p: dict | None = None):
    return _int_or_none((p or load()).get("yearTo"))


def languages(p: dict | None = None) -> list[str]:
    return [x.strip() for x in ((p or load()).get("langs") or "").split(",") if x.strip()]


def doc_types(p: dict | None = None) -> list[str]:
    """'journal' e/ou 'conference', conforme marcado no protocolo."""
    d = (p or load()).get("docTypes") or {}
    return [k for k in ("journal", "conference") if d.get(k)]


def criteria(kind: str, p: dict | None = None) -> list[dict]:
    """kind = 'ic' ou 'ec'. Cada item: {'c': 'IC1', 't': texto, 'rule': {...}}"""
    return [c for c in ((p or load()).get(kind) or []) if c.get("c")]


def source_ids(p: dict | None = None) -> list[str]:
    return [s.get("id") for s in ((p or load()).get("sources") or []) if s.get("id")]


def quote(t: str) -> str:
    return '"' + t.replace('"', "") + '"'
