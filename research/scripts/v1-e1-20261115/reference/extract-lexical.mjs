const containers=new Set(['root','paragraph','heading','list','listitem','table','tablerow','tablecell','link','code']);
const blocks=new Set(['paragraph','heading','listitem','tablecell','code']);
export function extractLexical(lexical) {
 const counts={}; let visited=0;
 function walk(node,depth){
  if(!node||typeof node!=='object'||Array.isArray(node)||depth>100||++visited>1000000)throw new Error('INVALID_LEXICAL_STRUCTURE');
  counts[node.type]=(counts[node.type]??0)+1;
  if(node.type==='text'){if(typeof node.text!=='string')throw new Error('INVALID_TEXT_NODE');return node.text;}
  if(node.type==='linebreak')return '\n';
  if(!containers.has(node.type))throw new Error(`UNSUPPORTED_NODE:${String(node.type)}`);
  if(!Array.isArray(node.children))throw new Error('INVALID_CONTAINER_CHILDREN');
  return node.children.map(child=>walk(child,depth+1)).join('')+(blocks.has(node.type)?'\n':'');
 }
 if(lexical?.root?.type!=='root')throw new Error('INVALID_ROOT');
 const text=walk(lexical.root,0).trimEnd();let codePoints=0;for(const c of text)codePoints++;
 return {text,codePoints,nodeCounts:counts};
}
