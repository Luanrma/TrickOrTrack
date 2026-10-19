# Runtime privado do projeto: não requer instalação global nem administrador.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location -LiteralPath $root
function Test-Node {
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) { return $false }
    & node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit((major===22&&minor>=17)||major>=24?0:1)' 2>$null
    return $LASTEXITCODE -eq 0
}
try {
    if (-not (Test-Node)) {
        $runtime = Join-Path $root '.local-runtime\node'
        if (Test-Path (Join-Path $runtime 'node.exe')) { $env:PATH = "$runtime;$env:PATH" }
        if (-not (Test-Node)) {
            $architecture = $env:PROCESSOR_ARCHITECTURE
            if ($env:PROCESSOR_ARCHITEW6432) { $architecture = $env:PROCESSOR_ARCHITEW6432 }
            switch ($architecture) { 'AMD64' { $arch = 'x64' } 'ARM64' { $arch = 'arm64' } default { throw 'Instale Node.js 24 LTS para a arquitetura do seu Windows.' } }
            Write-Host 'Preparando Node.js 24 LTS na pasta do projeto…'
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $base = 'https://nodejs.org/dist/latest-v24.x'
            $manifest = (Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt").Content
            $match = [regex]::Match($manifest, "(?m)^([a-fA-F0-9]{64})\s+(node-v24\.\d+\.\d+-win-$arch\.zip)\s*$")
            if (-not $match.Success) { throw 'Pacote oficial do Node.js não localizado.' }
            $archive = $match.Groups[2].Value
            $cache = Join-Path $root '.local-runtime'
            New-Item -ItemType Directory -Force -Path $cache | Out-Null
            $temporary = Join-Path $cache ('download-' + [guid]::NewGuid().ToString())
            New-Item -ItemType Directory -Path $temporary | Out-Null
            try {
                $zip = Join-Path $temporary $archive
                Invoke-WebRequest -UseBasicParsing -Uri "$base/$archive" -OutFile $zip
                if ((Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant() -ne $match.Groups[1].Value.ToLowerInvariant()) { throw 'Download do Node.js falhou na verificação SHA-256.' }
                Expand-Archive -LiteralPath $zip -DestinationPath $temporary
                if (Test-Path $runtime) { Remove-Item -LiteralPath $runtime -Recurse -Force }
                Move-Item -LiteralPath (Join-Path $temporary ($archive -replace '\.zip$', '')) -Destination $runtime
            } finally {
                if (Test-Path $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
            }
            $env:PATH = "$runtime;$env:PATH"
        }
    }
    if (-not (Test-Node)) { throw 'Não foi possível iniciar Node.js e npm. Instale Node.js 24 LTS.' }
    & node (Join-Path $root 'scripts\local.mjs') @args
    exit $LASTEXITCODE
} catch {
    Write-Host "Não foi possível preparar o ambiente: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
