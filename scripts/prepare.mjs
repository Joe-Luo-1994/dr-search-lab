import { prepare } from '../lib/artifacts.mjs';
const manifest = await prepare(Number(process.argv[2] || 100));
console.log(JSON.stringify(manifest, null, 2));
