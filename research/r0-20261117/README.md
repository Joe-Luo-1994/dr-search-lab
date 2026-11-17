# R0：固定版本 Pod 的發布與復原研究

[先讀結論與架構](docs/DR_N1_R0_INTEGRATION_RESULT_20261117.md) · [獨立審查](docs/DR_N1_R0_IMPLEMENTATION_REVIEW_20261117.md) · [實驗設計](docs/DR_N1_R0_RECREATE_PLAN_20261117.md) · [結果摘要](evidence/r0-release-20261117/integration-20261117-101241/review-summary.json)

已驗受控合成資料下的冷啟動、更新、壞包拒絕、恢復與回滾。1,377筆排程＝839成功、507中斷失敗、31版本409；無漏發或內容錯誤。**接受停機的候選，不是零停機、正式DR容量或低於完整A維運成本的證明。**

[完整程式與原始證據下載](source-and-evidence.tar.gz)：395份檔案，含歷次失敗、資源取樣與review。解壓至新目錄後保有docs/scripts/evidence相對結構；GitHub展開頁的細部證據連結請在解壓後使用。共用來源與先前N1結果見[既有N1包](../n1-20261117/README.md)及[早期研究包](../README.md)。不包含資料庫、索引、憑證或私密config，不宣稱一鍵重現。

個人路徑已替換；歷史原始hash仍指本機原件，驗公開副本請使用manifest內publicSha256。報告中「未push」是研究當時狀態，本包由此次commit發布。

archive SHA256: `5548b0558ada366af74f37b7d1298ffd8af5868790680d636b247d57c5fdc92e`

解壓後驗證：
```python
import hashlib,json,pathlib
root=pathlib.Path('.')
for f in json.loads((root/'manifest.json').read_text(encoding='utf8'))['files']:
    assert hashlib.sha256((root/f['path']).read_bytes()).hexdigest()==f['publicSha256'],f['path']
print('All public payload checksums match')
```
