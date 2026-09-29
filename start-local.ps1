#Requires -Version 5.1
# Start FINBIQ locally: checks tools, boots postgres+redis, applies schema+seed, starts API + web.
$ErrorActionPreference = "Stop"

function Need($cmd, $installHint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$cmd missing. $installHint" }
}

Need node "Install Node 22 LTS from nodejs.org, then reopen terminal."
Need docker "Install Docker Desktop, start it, then retry."

Write-Host "== 1/4 data services =="
docker compose up -d postgres redis

Write-Host "== 2/4 schema =="
Get-Content services\api\db\schema.sql -Raw | docker compose exec -T postgres psql -U finbiq -d finbiq -f -

Write-Host "== 3/4 seed =="
Get-Content services\api\db\seed.sql -Raw | docker compose exec -T postgres psql -U finbiq -d finbiq -f -

Write-Host "== 4/4 dev servers (two new windows) =="
Start-Process powershell -ArgumentList "-NoExit","-Command","pnpm --filter @finbiq/api dev"
Start-Process powershell -ArgumentList "-NoExit","-Command","pnpm --filter @finbiq/web dev"

Write-Host "Open http://localhost:5173 and http://localhost:4000/health"
