import fs from 'node:fs';
const base='scripts/cost-review-20261115/';
const model=fs.readFileSync(base+'model.mjs','utf8').replaceAll('export function','function');
const html=fs.readFileSync(base+'template.html','utf8').replace('/* MODEL */',model);
fs.writeFileSync('docs/DR_COST_DECISION_20261115.html',html);
console.log('Built offline cost decision page');
