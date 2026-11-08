#!/usr/bin/env bash
set -euo pipefail
cd /workspace/dr-search-lab
if curl -fsS --max-time 2 http://127.0.0.1:3000/api/lab/status >/dev/null 2>&1; then
  echo 'Stop the lab Next.js process before installation.' >&2; exit 1
fi
mkdir -p /workspace/toolchains
if ! test -x /workspace/toolchains/node-v22.21.1-linux-x64/bin/node; then
  (cd /workspace/toolchains
   curl -fsSLo SHASUMS256.txt https://nodejs.org/dist/v22.21.1/SHASUMS256.txt
   curl -fsSLO https://nodejs.org/dist/v22.21.1/node-v22.21.1-linux-x64.tar.xz
   sha256sum --check --ignore-missing SHASUMS256.txt
   tar -xJf node-v22.21.1-linux-x64.tar.xz)
fi
export PATH=/workspace/toolchains/node-v22.21.1-linux-x64/bin:$PATH
export PLAYWRIGHT_BROWSERS_PATH=/workspace/playwright-browsers
node --version
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npx playwright install chromium
test -f .lab/data/manifest.json || npm run prepare:data
npm test
if ! test -f .lab/es-native/dr/config/elasticsearch.yml; then
  node scripts/es-control.mjs setup
fi
if ! node -e 'if(!require("./.lab/reports/es-experiment-latest.json").passed)process.exit(1)' 2>/dev/null; then
  npm run experiment:es
fi
node --input-type=module <<'JS'
import fs from 'node:fs';
const r=JSON.parse(fs.readFileSync('.lab/reports/es-experiment-latest.json'));
if(!r.passed) throw Error('ES experiment must pass');
const text='ELASTICSEARCH_URL=http://127.0.0.1:19300\nLAB_INDEX_PREFIX='+r.prefix+'\n';
if(!fs.existsSync('.env.local')) fs.writeFileSync('.env.local',text,{flag:'wx'});
else {
 const e=fs.readFileSync('.env.local','utf8');
 if(!e.split(/\r?\n/).includes('ELASTICSEARCH_URL=http://127.0.0.1:19300') ||
    !e.split(/\r?\n/).includes('LAB_INDEX_PREFIX='+r.prefix))
   throw Error('Existing .env.local differs; reconcile ES settings without overwriting other values');
}
JS
npm run build
