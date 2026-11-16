import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const watchdog=setTimeout(()=>browser.close(),30000);
try{
 const page=await browser.newPage({viewport:{width:375,height:812}});
 await page.goto('http://127.0.0.1:3157',{waitUntil:'networkidle',timeout:15000});
 const cdp=await page.context().newCDPSession(page);
 const ax=await cdp.send('Accessibility.getFullAXTree');
 const report={at:new Date().toISOString(),browser:browser.version(),exactLabelCount:await page.getByLabel('研究身份',{exact:true}).count(),prefixRoleCount:await page.getByRole('combobox',{name:/^研究身份/}).count(),controls:await page.locator('select').evaluateAll(xs=>xs.map(x=>({html:x.outerHTML,labels:[...x.labels].map(l=>l.textContent)}))),axComboboxes:ax.nodes.filter(x=>x.role?.value==='combobox')};
 await fs.writeFile('evidence/v1-e1-followup-20261115/ui-inspection.json',JSON.stringify(report,null,2),{flag:'wx'});
 console.log(JSON.stringify({exactLabelCount:report.exactLabelCount,prefixRoleCount:report.prefixRoleCount,names:report.axComboboxes.map(x=>x.name)}));
}finally{clearTimeout(watchdog);await browser.close();}
