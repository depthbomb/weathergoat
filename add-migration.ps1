param([string]$migrationName)

if (-not $migrationName) {
    Write-Host "Missing migration name"
    exit
}

Invoke-Expression "dotnet ef migrations add $migrationName --startup-project WeatherGoat --project WeatherGoat.Data -o Migrations"
