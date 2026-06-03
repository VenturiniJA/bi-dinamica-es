import os
import glob
import json
import pandas as pd
# pyrefly: ignore [missing-import]
from PyPDF2 import PdfReader

# Configuração de caminhos
data_dir = os.path.join(os.getcwd(), 'dados_locais')
relatorios_dir = os.path.join(data_dir, 'relatorios')
pe_dir = os.path.join(data_dir, 'pe')
output_json = os.path.join(os.getcwd(), 'src', 'db.json')

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
                    print(f"Erro lendo PDF {f}: {e}")
    return " ".join(all_texts)

def main():
    print("=== Iniciando Extração ETL Local ===")
    
    # 1. Encontrar a planilha de EJs
    excel_files = glob.glob(os.path.join(relatorios_dir, 'ejs_2026_*.xlsx'))
    if not excel_files:
        print("Erro: Planilha ejs_2026_*.xlsx não encontrada no diretório de relatórios!")
        return
        
    excel_path = excel_files[0]
    print(f"Lendo base Excel: {os.path.basename(excel_path)}")
    df = pd.read_excel(excel_path)
    
    # Filtrando apenas as 28 EJs da Juniores ES
    df = df[df['FEDERACAO'] == 'Juniores']
    print(f"EJs encontradas para a Juniores: {len(df)}")
    
    # 2. Extrair Textos dos PDFs do PE
    print("Lendo corpus de PDFs do Planejamento Estratégico...")
    pdf_text_corpus = extract_pdf_texts(pe_dir)
    pdf_text_corpus_lower = pdf_text_corpus.lower()
    
    # 3. Processar EJs
    print("Mapeando indicadores das Empresas Juniores...")
    ejs_list = []
    current_month = 6 # Fixando em Junho conforme dados
    
    # Função segura para pegar floats, contornando NaN do Pandas
    def safe_float(val, default=0.0):
        if pd.isna(val): return default
        try: return float(val)
        except: return default

    for _, row in df.iterrows():
        try:
            nome = str(row.get('EMPRESA_JUNIOR', 'Desconhecida')).strip()
            if pd.isna(nome) or nome == 'nan':
                continue
                
            # Faturamento e Metas
            faturamento_meta = safe_float(row.get('META_DE_REVENUE'))
            faturamento_alcancado = safe_float(row.get('FATURAMENTO'))
            faturamento_projetado = (faturamento_alcancado / current_month) * 12 if current_month > 0 else 0
            
            # Projetos de Impacto
            projetos_meta = safe_float(row.get('META_DE_IMPACT_PROJECTS'))
            projetos_alcancado = safe_float(row.get('PROJETOS_DE_IMPACTO'))
            
            # CSAT
            csat = safe_float(row.get('CSAT'))
            
            # Lógica Binária do Portal
            alto_crescimento = (faturamento_alcancado >= faturamento_meta) and (projetos_alcancado >= projetos_meta)
            # Risco baseia-se na tendência de run-rate linear vs meta anual
            at_risk = faturamento_projetado < faturamento_meta
            
            # Busca do Resumo Executivo no PE
            summary = "Sem menção direta nos documentos de Planejamento Estratégico."
            nome_lower = nome.lower()
            if nome_lower in pdf_text_corpus_lower:
                idx = pdf_text_corpus_lower.find(nome_lower)
                start = max(0, idx - 30)
                end = min(len(pdf_text_corpus), idx + 250)
                snippet = pdf_text_corpus[start:end].replace('\n', ' ').strip()
                summary = f"... {snippet} ..."
                
            cluster_val = row.get('CLUSTER_2026', 0)
            
            ej_obj = {
                "id": safe_float(row.get('ID', 0)),
                "nome": nome,
                "cluster": cluster_val if not pd.isna(cluster_val) else 0,
                "fundacao": str(row.get('DATA_DE_CADASTRO', 'N/D')),
                "faturamento": {
                  "meta": faturamento_meta,
                  "alcancado": faturamento_alcancado,
                  "metaAno": faturamento_meta,
                  "projetado": faturamento_projetado
                },
                "csat": {
                  "meta": safe_float(row.get('META_DE_CSAT', 3.5)),
                  "alcancado": csat
                },
                "membros": {
                  "permanenciaMeta": safe_float(row.get('META_DE_LENGTH_OF_STAY')),
                  "permanenciaAlcancado": safe_float(row.get('TEMPO_PERMANENCIA_NO_MEJ')),
                  "engajamentoMeta": safe_float(row.get('META_DE_MEJ_ENGAGED_MEMBERS')),
                  "engajamentoAlcancado": safe_float(row.get('QUANTIDADE_DE_MEMBROS_ENGAJADOS_COM_MEJ'))
                },
                "projetos": {
                  "meta": projetos_meta,
                  "alcancado": projetos_alcancado
                },
                "altoCrescimento": alto_crescimento,
                "atRisk": at_risk,
                "summary": summary
            }
            ejs_list.append(ej_obj)
        except Exception as e:
            print(f"Aviso: Falha ao processar linha da EJ {row.get('EMPRESA_JUNIOR')}: {e}")
            
    # 4. Escrita do DB.json
    print(f"Sobrescrevendo o banco de dados visual {output_json} com {len(ejs_list)} EJs...")
    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(ejs_list, f, ensure_ascii=False, indent=2)
        
    print("=== Concluído! ===")

if __name__ == "__main__":
    main()
