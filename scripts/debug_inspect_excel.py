"""Script diagnostico TEMPORANEO: stampa la struttura reale dell'Excel
quotazioni scaricato, per verificare nomi colonne e valori effettivi
(investigazione ruolo Mantra). Non fa parte della pipeline regolare,
va rimosso una volta chiarito il problema.

Uso: python3 scripts/debug_inspect_excel.py [path/al/file.xlsx]
"""
import sys

import pandas as pd

from lib.config import repo_path

path = sys.argv[1] if len(sys.argv) > 1 else repo_path("data", "raw", "quotazioni.xlsx")

print(f"--- Ispeziono {path} ---")

raw = pd.read_excel(path, header=None, nrows=3)
print("\nPrime 3 righe SENZA skiprows (raw):")
print(raw.to_string())

df = pd.read_excel(path, skiprows=1)
print("\nColonne (con skiprows=1):")
print(list(df.columns))

print("\nPrime 5 righe:")
print(df.head(5).to_string())

role_like = [c for c in df.columns if isinstance(c, str) and ("r" in c.lower()) and len(str(c)) <= 6]
print(f"\nColonne candidate 'ruolo' (nome corto contenente 'r'): {role_like}")

for col in role_like:
    print(f"\nValori unici in colonna '{col}': {sorted(df[col].dropna().unique().tolist())}")

if "R" in df.columns and "Rm" in df.columns:
    diff = df[df["R"] != df["Rm"]]
    print(f"\nRighe dove R != Rm: {len(diff)} su {len(df)}")
    if len(diff) > 0:
        print(diff[["Nome", "R", "Rm"]].head(10).to_string())
