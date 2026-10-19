#!/usr/bin/env bash
# Prepara uma demonstração local sem alterar o Node.js instalado no computador.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

compatible_node() {
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 &&
    node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit((major===22&&minor>=17)||major>=24?0:1)' >/dev/null 2>&1
}

if ! compatible_node; then
  runtime="$ROOT/.local-runtime/node"
  if [[ -x "$runtime/bin/node" && -x "$runtime/bin/npm" ]]; then
    export PATH="$runtime/bin:$PATH"
  fi
  if ! compatible_node; then
    case "$(uname -s)" in Linux) platform=linux ;; Darwin) platform=darwin ;; *) echo 'No Windows, execute iniciar-local.cmd.' >&2; exit 1 ;; esac
    case "$(uname -m)" in x86_64|amd64) arch=x64 ;; aarch64|arm64) arch=arm64 ;; *) echo 'Arquitetura não suportada automaticamente. Instale Node.js 24 LTS.' >&2; exit 1 ;; esac
    fetch_file() {
      if command -v curl >/dev/null 2>&1; then curl --fail --location --silent --show-error --connect-timeout 20 --max-time 600 "$1" --output "$2";
      elif command -v wget >/dev/null 2>&1; then wget --timeout=60 -q "$1" -O "$2";
      else echo 'Instale curl ou wget para baixar o Node.js, ou instale Node.js 24 LTS manualmente.' >&2; return 1; fi
    }
    command -v tar >/dev/null 2>&1 || { echo 'O utilitário tar é necessário para preparar Node.js.' >&2; exit 1; }
    if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
      echo 'Instale sha256sum ou shasum para verificar o download.' >&2; exit 1
    fi
    mkdir -p "$ROOT/.local-runtime"
    download_dir="$(mktemp -d "$ROOT/.local-runtime/download.XXXXXX")"
    trap 'rm -rf -- "$download_dir"' EXIT
    echo 'Preparando Node.js 24 LTS na pasta do projeto…'
    base=https://nodejs.org/dist/latest-v24.x
    fetch_file "$base/SHASUMS256.txt" "$download_dir/SHASUMS256.txt"
    archive="$(awk -v suffix="-$platform-$arch.tar.gz" 'index($2,suffix) && substr($2,length($2)-length(suffix)+1)==suffix {print $2;exit}' "$download_dir/SHASUMS256.txt")"
    [[ "$archive" =~ ^node-v24\.[0-9]+\.[0-9]+-(linux|darwin)-(x64|arm64)\.tar\.gz$ ]] || { echo 'Não foi possível identificar o pacote oficial do Node.js.' >&2; exit 1; }
    expected="$(awk -v file="$archive" '$2==file {print $1;exit}' "$download_dir/SHASUMS256.txt")"
    [[ "$expected" =~ ^[a-fA-F0-9]{64}$ ]] || { echo 'Checksum oficial inválido.' >&2; exit 1; }
    fetch_file "$base/$archive" "$download_dir/$archive"
    if command -v sha256sum >/dev/null 2>&1; then actual="$(sha256sum "$download_dir/$archive" | awk '{print $1}')";
    else actual="$(shasum -a 256 "$download_dir/$archive" | awk '{print $1}')"; fi
    [[ "$actual" == "$expected" ]] || { echo 'O download do Node.js falhou na verificação SHA-256. Execute novamente.' >&2; exit 1; }
    mkdir "$download_dir/extracted"
    tar -xzf "$download_dir/$archive" -C "$download_dir/extracted" --strip-components=1
    # Somente o runtime privado do projeto é substituído.
    rm -rf -- "$runtime"
    mv "$download_dir/extracted" "$runtime"
    export PATH="$runtime/bin:$PATH"
  fi
fi
compatible_node || { echo 'Não foi possível iniciar Node.js e npm. Instale Node.js 24 LTS.' >&2; exit 1; }
# Não usar exec: o trap deve remover os arquivos temporários ao encerrar.
node "$ROOT/scripts/local.mjs" "$@"
