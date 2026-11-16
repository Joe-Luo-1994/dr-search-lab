"""Verify public artifact bytes; optionally unpack a separate audit workspace. Runs no experiments."""
from pathlib import Path
import argparse,gzip,hashlib,json
root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--extract',action='store_true',help='write decoded public files under research/expanded; never execute them')
args=parser.parse_args()
delivery=json.loads((root/'delivery.json').read_text(encoding='utf8'))
for item in delivery['files']:
 p=(root/item['path']).resolve()
 assert p.is_relative_to(root),item['path']
 b=p.read_bytes()
 assert len(b)==item['bytes'] and hashlib.sha256(b).hexdigest()==item['sha256'],item['path']
manifest=json.loads((root/'manifest.json').read_text(encoding='utf8'))
def sha(b):return hashlib.sha256(b).hexdigest()
count=0
for f in manifest['files']:
 p=(root/f['path']).resolve()
 assert p.is_relative_to(root),f['path']
 b=p.read_bytes();assert len(b)==f['storedBytes'] and sha(b)==f['storedSha256'],f['path']
 decoded=gzip.decompress(b) if f['encoding'].startswith('gzip') else b
 assert len(decoded)==f['publicBytes'] and sha(decoded)==f['publicSha256'],f['path']
 if args.extract:
  target=(root/'expanded'/f['source']).resolve()
  assert target.is_relative_to(root/'expanded'),f['source']
  if target.exists():assert target.read_bytes()==decoded,'Refuse to overwrite different file: '+str(target)
  else:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(decoded)
 count+=1
print(json.dumps({'passed':True,'sourceFiles':count,'deliveryFiles':len(delivery['files']),'extracted':args.extract,'scope':'delivery and decoded public bytes verified; delivery manifest itself anchored by Git commit; no original environment or benchmark execution'}))
