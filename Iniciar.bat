@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Prospect AI - Iniciar
cd /d "%~dp0"

echo.
echo  === Ademicon Prospect AI: sistema de gestao + landing ===
echo.

rem 0) Programas necessarios
where node >nul 2>&1
if errorlevel 1 (
  echo  FALTA O NODE.JS. Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b 1
)
where docker >nul 2>&1
if errorlevel 1 (
  echo  FALTA O DOCKER DESKTOP. Instale em https://www.docker.com/products/docker-desktop e rode este arquivo de novo.
  pause
  exit /b 1
)

rem 1) Configuracao local (.env) - criada so na primeira vez, com segredos gerados
node scripts\primeira-instalacao.mjs
if errorlevel 1 (
  echo  ERRO ao criar a configuracao local.
  pause
  exit /b 1
)

rem 2) Docker Desktop (banco de dados e Redis)
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

rem 3) Banco (Postgres) e Redis
docker compose up -d postgres redis
if errorlevel 1 (
  echo  ERRO ao subir o banco. Verifique o Docker Desktop.
  pause
  exit /b 1
)

rem 4) Dependencias (so na primeira vez)
if not exist "node_modules" (
  echo  Instalando dependencias do sistema de gestao (primeira vez, alguns minutos^)...
  call npm install
  if errorlevel 1 (
    echo  ERRO no npm install.
    pause
    exit /b 1
  )
)
if not exist "apps\landing\node_modules" (
  echo  Instalando dependencias da landing...
  pushd apps\landing
  call npm install
  popd
)

rem 5) Tabelas do banco (aplica migrations pendentes; espera o Postgres aceitar conexao)
set TENTATIVAS=0
:migrar
call npx prisma migrate deploy
if errorlevel 1 (
  set /a TENTATIVAS+=1
  if !TENTATIVAS! GEQ 10 (
    echo  ERRO ao criar as tabelas do banco.
    pause
    exit /b 1
  )
  timeout /t 3 /nobreak >nul
  goto migrar
)

rem 6) Dados de DEMONSTRACAO - so na primeira vez (o seed APAGA o banco antes de criar os dados ficticios)
if not exist ".seed-feito" (
  echo  Criando os dados de demonstracao (ficticios^)...
  call npm run db:seed
  if errorlevel 1 (
    echo  ERRO ao criar os dados de demonstracao.
    pause
    exit /b 1
  )
  echo feito> .seed-feito
)

rem 7) Sobe os dois servicos, cada um na sua janela (feche a janela para parar)
start "Prospect AI - Gestao (3500)" cmd /k "npm run dev"
start "Prospect AI - Landing (3600)" cmd /k "cd apps\landing && npm run dev"

echo.
echo  Aguardando o sistema iniciar...
timeout /t 20 /nobreak >nul
start "" http://localhost:3500/login
start "" http://localhost:3600/

echo.
echo  Pronto. (na primeira abertura as paginas demoram um pouco para compilar)
echo    Gestao:   http://localhost:3500   - contas de demonstracao na tela de login (senha Prospect@2026)
echo    Landing:  http://localhost:3600   - site mestre
echo    Link de consultor: http://localhost:3600/c/joana-barros
echo.
echo  Para parar: feche as janelas "Prospect AI - Gestao" e "Prospect AI - Landing".
echo.
pause
