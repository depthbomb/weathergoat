$cwd = Split-Path -Parent $MyInvocation.MyCommand.Path
$compiledModelsFolder = Join-Path -Path $cwd -ChildPath "WeatherGoat.Data\CompiledModels"
$serviceExtensionsFile = Join-Path -Path $cwd -ChildPath "WeatherGoat\Extensions\ServiceCollectionExtensions.cs"
$usingTargetText = "using WeatherGoat.Data.CompiledModels;"
$usingReplaceText = "// $usingTargetText"
$useModelTargetText = "o.UseModel(AppDbContextModel.Instance);"
$useModelReplaceText = "// $useModelTargetText"

function ToggleComment {
    param (
        [string]$filePath,
        [string]$targetText,
        [string]$replaceText
    )

    $fileContents = Get-Content -Path $filePath
    $fileContents = $fileContents -replace [regex]::Escape($targetText), $replaceText
    $fileContents | Set-Content -Path $filePath
}

if (Test-Path $compiledModelsFolder -PathType Container) {
    Remove-Item -Path $compiledModelsFolder -Recurse -Force
    Write-Host "Deleted compiled models"
}

if (-Not (Test-Path $serviceExtensionsFile -PathType Leaf)) {
    Write-Error "Service extensions file not found at $serviceExtensionsFile"
    exit 1
}

Write-Host "Commenting out UseModel call..."
ToggleComment -filePath $serviceExtensionsFile -targetText $usingTargetText -replaceText $usingReplaceText
ToggleComment -filePath $serviceExtensionsFile -targetText $useModelTargetText -replaceText $useModelReplaceText

Write-Host "Optimizing database context..."
Invoke-Expression "dotnet ef dbcontext optimize --startup-project WeatherGoat --project WeatherGoat.Data"

Write-Host "Uncommenting UseModel call..."
ToggleComment -filePath $serviceExtensionsFile -targetText $usingReplaceText -replaceText $usingTargetText
ToggleComment -filePath $serviceExtensionsFile -targetText $useModelReplaceText -replaceText $useModelTargetText
