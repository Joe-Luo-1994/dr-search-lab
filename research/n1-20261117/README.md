# N1 實驗備份 — 2026-11-17

[決策報告](docs/DR_N1_OUTCOME_20261117.md) · [獨立review](docs/DR_N1_POSTREVIEW_20261117.md) · [設計](docs/DR_NATIVE_BASELINE_PLAN_20261116.md)

完整設計、程式、原始量測、環境修復及失敗證據：[下載 source-and-evidence.tar.gz](source-and-evidence.tar.gz)。下載後解壓至新目錄，依原有 docs/scripts/evidence 結構閱讀；GitHub 上僅另展開報告與主要摘要，細節連結請在解壓後使用。較早的共用來源在本 repo 既有 research 包；本包不宣稱一鍵重現。

G1/G2/G3a 限定結案。Tantivy 三輪 Web／混合負載通過；SQLite 此 E 配置 Web 暖機失敗，無同分次排序的 Top-K 尚未測。G3b 更新未做，不代表正式 DR 可部署或最低 TCO。

個人路徑／主機名稱已替換。未包含 DB、索引、私密 config、env 或憑證；本機原件保留。manifest 同時列原始與公開副本 checksum，來源hash不應拿來驗公開副本。舊實驗報告內的「尚未push」是當時狀態；本備份已由本次Git commit發布。

archive SHA256: `eea9b9112412afc5d8da3d07b4fff94d5a21fbe1becbe616fde57f0555f46577`

驗證解壓檔案：在解壓目錄執行下列 Python（manifest 內每筆 publicSha256）。
```python
import hashlib,json,pathlib
root=pathlib.Path('.')
for f in json.loads((root/'manifest.json').read_text(encoding='utf8'))['files']:
    assert hashlib.sha256((root/f['path']).read_bytes()).hexdigest()==f['publicSha256'],f['path']
print('All public payload checksums match')
```
