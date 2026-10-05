@echo off
chcp 65001 >nul
title Prospect AI - Iniciar
cd /d "%~dp0"

echo.
echo  === Prospect AI: sistema de gestao + landings das PJs ===
echo.

rem 1) Docker Desktop (banco de dados e Redis)
docker info >nul 2>&1
if errorlevel 1 (
  echo  Abrindo o Docker Desktop...
  start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  echo  Aguardando o Docker ficar pronto (pode levar 1 minuto^)...
  :espera_docker
  timeout /t 3 /nobreak >nul
  docker info >nul 2>&1
  if errorlevel 1 goto espera_docker
)
echo  Docker pronto.

rem 2) Banco (Postgres) e Redis
docker compose up -d postgres redis
if errorlevel 1 (
  echo  ERRO ao subir o banco. Verifique o Docker Desktop.
  pause
  exit /b 1
)

rem 3) Dependencias (so na primeira vez)
if not exist "node_modules" call npm install
if not exist "apps\landing\node_modules" (
  pushd apps\landing
  call npm install
  popd
)

rem 4) Aplica migrations pendentes
call npx prisma migrate deploy

rem 5) Sobe os dois servicos, cada um na sua janela (feche a janela para parar)
start "Prospect AI - Gestao (3500)" cmd /k "npm run dev"
start "Prospect AI - Landings (3600)" cmd /k "cd apps\landing && npm run dev"

echo.
echo  Aguardando o sistema iniciar...
timeout /t 15 /nobreak >nul
start "" http://localhost:3500/login
start "" http://jundiai-centro.localhost:3600/

echo.
echo  Pronto!
echo    Gestao:   http://localhost:3500   (gestor@prospect.demo / senha do README)
echo    Landing:  http://jundiai-centro.localhost:3600
echo.
echo  Para parar: feche as janelas "Prospect AI - Gestao" e "Prospect AI - Landings".
echo.
pause
