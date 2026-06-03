@echo off
echo ===================================================
echo Iniciando o Servidor Local da Plataforma de BI...
echo ===================================================

echo Abrindo o Chrome...
start chrome http://localhost:3000

echo.
echo O servidor estático está rodando. Pode fechar esta janela quando terminar.
echo.

cd src
py -m http.server 3000
