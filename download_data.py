# pyrefly: ignore [missing-import]
import gdown
import os

def download_folder(folder_url, output_dir):
    print(f"Baixando pasta {folder_url} para {output_dir}")
    os.makedirs(output_dir, exist_ok=True)
    # gdown.download_folder requires the folder URL
    gdown.download_folder(url=folder_url, output=output_dir, quiet=False, use_cookies=False)

if __name__ == '__main__':
    data_dir = os.path.join(os.getcwd(), 'dados_locais')
    os.makedirs(data_dir, exist_ok=True)
    
    pe_url = 'https://drive.google.com/drive/folders/1YnyjpXO0doVj-HLRF4rGSt9FKNbLaUn9'
    relatorios_url = 'https://drive.google.com/drive/folders/19FTHNT_5jvqJtQ8ST0xpGLCdTmJwKNn3'
    
    download_folder(pe_url, os.path.join(data_dir, 'pe'))
    download_folder(relatorios_url, os.path.join(data_dir, 'relatorios'))
    
    print("Download concluído com sucesso!")
