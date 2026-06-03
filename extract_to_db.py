import os
import json
import pandas as pd
# pyrefly: ignore [missing-import]
from PyPDF2 import PdfReader

url = 'https://docs.google.com/spreadsheets/d/163X5ADTJkHXK4INVs4KPdAXveUXhz0sYEoDGIdHWdOM/export?format=csv&gid=1067661499'
output_json = os.path.join(os.getcwd(), 'src', 'db.json')
pe_dir = os.path.join(os.getcwd(), 'dados_locais', 'pe')

def extract_pdf_texts(pdf_dir):
    all_texts = []
    if os.path.exists(pdf_dir):
        for f in os.listdir(pdf_dir):
            if f.endswith('.pdf'):
                path = os.path.join(pdf_dir, f)
                try:
                    reader = PdfReader(path)
                    text = ""
                    for page in reader.pages:
                        text += page.extract_text() or ""
                    all_texts.append(text)
                except Exception as e:
                    pass
    return " ".join(all_texts)

def main():
    print("=== Iniciando Extração Google Sheets (Tracking DDE 26) ===")
    
    # Lendo o CSV direto do Google Sheets
    print(f"Baixando dados de {url}...")
    df = pd.read_csv(url, skiprows=1)
    
    # Como pode haver problemas de acentuação dependendo do SO/CSV, pegamos por substring
    col_id = [c for c in df.columns if 'ID' in c][0]
    col_ej = [c for c in df.columns if 'EJ' in c and 'EXCELENTE' not in c][0]
    col_excelente = [c for c in df.columns if 'EJ EXCELENTE' in c][0]
    col_cluster = [c for c in df.columns if 'Cluster' in c and 'Farol' not in c][0]
    
    # Faturamento
    col_meta_fat = [c for c in df.columns if 'Meta de Faturamento' in c][0]
    col_fat_alcan = [c for c in df.columns if 'Faturamento' in c and 'Alcan' in c][0]
    col_meta_mes = [c for c in df.columns if 'Meta do M' in c][0]
    
    # CSAT
    col_meta_csat = [c for c in df.columns if 'META de CSAT' in c][0]
    col_csat = [c for c in df.columns if 'CSAT' in c and 'META' not in c and '%' not in c][0]
    
    # Engajamento
    col_meta_eng = [c for c in df.columns if 'Meta de Engajamento' in c][0]
    col_eng = [c for c in df.columns if 'Engajamento com o MEJ' in c and 'Meta' not in c][0]
    
    # Tempo de Permanencia
    col_meta_tempo = [c for c in df.columns if 'Meta de Tempo de Perman' in c][0]
    col_tempo = [c for c in df.columns if 'Tempo de Perman' in c and 'Meta' not in c][0]

    # Federação
    col_fed = [c for c in df.columns if 'Federa' in c][0]

    # Removendo NAs e Filtrando apenas as 28 EJs da Juniores
    df = df.dropna(subset=[col_ej])
    df = df[df[col_fed] == 'Juniores']
    
    # Limpando strings financeiras (R$ 45.670,90 -> 45670.90)
    def clean_money(val):
        if pd.isna(val): return 0.0
        val_str = str(val).replace('R$', '').replace('.', '').replace(',', '.').strip()
        try: return float(val_str)
        except: return 0.0

    def safe_float(val):
        if pd.isna(val): return 0.0
        try: return float(str(val).replace(',', '.'))
        except: return 0.0

    print("Lendo corpus de PDFs...")
    pdf_text_corpus = extract_pdf_texts(pe_dir).lower()

    ejs_list = []

    for _, row in df.iterrows():
        nome = str(row[col_ej]).strip()
        if nome.upper() in ['CONCENTRO', 'EJ', 'NAN', '']: continue
        
        # Cores (Farol)
        farol = str(row[col_excelente]).strip().upper()

        summary = "Resumo do PE não encontrado."
        if nome.lower() in pdf_text_corpus:
            idx = pdf_text_corpus.find(nome.lower())
            start = max(0, idx - 30)
            end = min(len(pdf_text_corpus), idx + 250)
            summary = f"... {pdf_text_corpus[start:end].replace(chr(10), ' ').strip()} ..."
            
        ej_obj = {
            "id": safe_float(row[col_id]),
            "nome": nome,
            "farol": farol,
            "cluster": safe_float(row[col_cluster]),
            "faturamento": {
                "metaAno": clean_money(row[col_meta_fat]),
                "alcancado": clean_money(row[col_fat_alcan]),
                "metaMes": clean_money(row[col_meta_mes])
            },
            "csat": {
                "meta": safe_float(row[col_meta_csat]),
                "alcancado": safe_float(row[col_csat])
            },
            "engajamento": {
                "meta": safe_float(row[col_meta_eng]),
                "alcancado": safe_float(row[col_eng])
            },
            "tempo": {
                "meta": safe_float(row[col_meta_tempo]),
                "alcancado": safe_float(row[col_tempo])
            },
            "summary": summary
        }
        ejs_list.append(ej_obj)

    print(f"Salvas {len(ejs_list)} EJs no db.json.")
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(ejs_list, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
