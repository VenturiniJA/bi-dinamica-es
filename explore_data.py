import pandas as pd
import os
import json

data_dir = os.path.join(os.getcwd(), 'dados_locais')
relatorios_dir = os.path.join(data_dir, 'relatorios')

print("=== Explorando Arquivos Excel ===")
for f in os.listdir(relatorios_dir):
    if f.endswith('.xlsx'):
        path = os.path.join(relatorios_dir, f)
        print(f"\nArquivo: {f}")
        try:
            df = pd.read_excel(path, nrows=5)
            print("Colunas:")
            print(df.columns.tolist())
        except Exception as e:
            print(f"Erro ao ler {f}: {e}")
