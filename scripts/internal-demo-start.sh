#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
for item in .env .env.*; do
  [[ "$item" == '.env.example' ]] && continue
  if [[ -e "$item" || -L "$item" ]]; then echo "REFUSED: $item found in synthetic demo." >&2; exit 2; fi
done
for name in LAB_DATA_DIR LAB_INDEX_PREFIX ELASTICSEARCH_URL MEILISEARCH_URL TYPESENSE_URL NODE_OPTIONS; do
  if [[ -n "${!name:-}" ]]; then echo "REFUSED: inherited $name." >&2; exit 2; fi
done
node --input-type=module <<'JS'
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyArtifacts} from './lib/artifacts.mjs';
if(process.version!=='v22.21.1')throw Error('Use validated Node v22.21.1');
const p=JSON.parse(await readFile('.lab/internal-demo/prepared.json','utf8'));
const hash=createHash('sha256').update(await readFile('.lab/data/manifest.json')).digest('hex');
if(p.manifestSha256!==hash || p.buildId!==(await readFile('.next/BUILD_ID','utf8')).trim())throw Error('Prepared artifacts changed; stop and preserve evidence');
for(const version of ['v1','v2'])await verifyArtifacts(version);
JS
export NEXT_TELEMETRY_DISABLED=1
# Keep the foreground process under the operator's terminal/service manager.
exec npm run start -- --port "${DEMO_PORT:-3100}"
