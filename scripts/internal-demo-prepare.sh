#!/usr/bin/env bash
# Fresh synthetic copy only. Never use this to repair an existing environment.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
for item in .lab .next node_modules .env .env.*; do
  [[ "$item" == '.env.example' ]] && continue
  if [[ -e "$item" || -L "$item" ]]; then
    echo "REFUSED: $item exists. Preserve this directory; use a new extracted source copy." >&2
    exit 2
  fi
done
for name in LAB_DATA_DIR LAB_INDEX_PREFIX ELASTICSEARCH_URL MEILISEARCH_URL TYPESENSE_URL NODE_OPTIONS; do
  if [[ -n "${!name:-}" ]]; then echo "REFUSED: inherited $name; use a clean demo shell." >&2; exit 2; fi
done
node --input-type=module -e 'if(process.version!=="v22.21.1")throw Error("Validated runtime required: Node v22.21.1; current="+process.version)'
mkdir -p .lab/internal-demo
exec > >(tee .lab/internal-demo/prepare.log) 2>&1
trap 'echo "FAILED at line $LINENO. Preserve logs; do not delete runtime or retry in place."' ERR
export npm_config_cache="${npm_config_cache:-$PWD/.lab/npm-cache}"
export NEXT_TELEMETRY_DISABLED=1
npm ci --no-audit --no-fund
npm run prepare:data
npm test
npm run build
node --input-type=module <<'JS'
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=await readFile('.lab/data/manifest.json');
await writeFile('.lab/internal-demo/prepared.json',JSON.stringify({at:new Date().toISOString(),node:process.version,synthetic:true,engines:3,es:false,minio:false,realReBAC:false,buildId:(await readFile('.next/BUILD_ID','utf8')).trim(),manifestSha256:createHash('sha256').update(manifest).digest('hex')},null,2));
JS
echo 'Prepared synthetic demo. Start: bash scripts/internal-demo-start.sh'
