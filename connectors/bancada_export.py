"""
Grava, além do CSV padrão do pipeline, uma versão para importar na Bancada
PRISMA com colunas extras (tipo de documento, idioma, palavras-chave).

O CSV padrão (PAPER_FIELDS) continua igual, para não quebrar as etapas
numeradas do pipeline.
"""

import csv
import os

from connectors.base import PAPER_FIELDS

EXTRA_FIELDS = ["doc_type", "language", "keywords"]


def write_bancada_csv(papers, extras, out_path):
    """papers: lista de Paper; extras: lista de dicts com EXTRA_FIELDS, na mesma ordem."""
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=PAPER_FIELDS + EXTRA_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for p, ex in zip(papers, extras):
            row = p.to_dict()
            row.update({k: ex.get(k, "") for k in EXTRA_FIELDS})
            writer.writerow(row)
    print(f"Arquivo para a Bancada: {out_path}")
