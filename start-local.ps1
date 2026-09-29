#Requires -Version 5.1
# Start FINBIQ locally (no Docker required).
# Docker mode:  .\start-local.ps1
# Native mode:  .\start-local.ps1 -NoDocker   (uses local PostgreSQL 17 service + psql)
param([switch]$NoDocker)
$ErrorActionPreference = "Stop"

function Need($cmd, $installHint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$cmd missing. $installHint" }
}

Need node "Install Node 22 LTS from nodejs.org, then reopen terminal."
if (-not $NoDocker) { Need docker "Install Docker Desktop, start it, then retry (or use -NoDocker with native Postgres)." }

$env:PGPASSWORD = "finbiq_dev_only"

if ($NoDocker) {
  $psql = Get-Command psql -ErrorAction SilentlyContinue
  if (-not $psql) {
    $cand = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
    if (Test-Path $cand) { $psql = $cand } else { throw "psql missing. Install PostgreSQL 17 (EDB installer), then reopen terminal." }
  }
  Write-Host "== 1/4 postgres service =="
  $svc = Get-Service postgresql-x64-17 -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -ne "Running") { Start-Service postgresql-x64-17 }
  & $psql -U postgres -h localhost -c "SELECT 1" | Out-Null
  & $psql -U postgres -h localhost -tc "SELECT 1 FROM pg_roles WHERE rolname='finbiq'" | ForEach-Object {
    if ($_ -notmatch "1") { & $psql -U postgres -h localhost -c "CREATE USER finbiq WITH PASSWORD 'finbiq_dev_only'" }
  }
  & $psql -U postgres -h localhost -tc "SELECT 1 FROM pg_database WHERE datname='finbiq'" | ForEach-Object {
    if ($_ -notmatch "1") { & $psql -U postgres -h localhost -c "CREATE DATABASE finbiq OWNER finbiq" }
  }

  Write-Host "== 2/4 schema =="
  & $psql -U finbiq -h localhost -d finbiq -f services\api\db\schema.sql

  Write-Host "== 3/4 seed =="
  & $psql -U finbiq -h localhost -d finbiq -f services\api\db\seed.sql
} else {
  Write-Host "== 1/4 data services =="
  docker compose up -d postgres redis

  Write-Host "== 2/4 schema =="
  Get-Content services\api\db\schema.sql -Raw | docker compose exec -T postgres psql -U finbiq -d finbiq -f -

  Write-Host "== 3/4 seed =="
  Get-Content services\api\db\seed.sql -Raw | docker compose exec -T postgres psql -U finbiq -d finbiq -f -
}

Write-Host "== 4/4 dev servers (two new windows) =="
Start-Process powershell -ArgumentList "-NoExit","-Command","pnpm --filter @finbiq/api dev"
Start-Process powershell -ArgumentList "-NoExit","-Command","pnpm --filter @finbiq/web dev"

Write-Host "Open http://localhost:5173 and http://localhost:4000/health"
