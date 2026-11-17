# N1 新增工程與維護責任帳

2026-11-17，執行中；不是公司DevOps工時估價。部署種類少不等於維護零成本。所有結果僅合成研究，未推送。

| 工作 | 本輪觀察 | 後續維護責任／邊界 |
|---|---|---|
| SQLite原生查詢 | 沿用Node22.18與既有DB；S1以rank保留3/1與pageId tie；G1 128組通過 | 升級Node／SQLite／ICU需回歸；小fixture未證效能 |
| Tantivy工具鏈 | 原環境無Rust；隔離安裝1.88、因新解析依賴最低版本升到1.90；同Cargo.lock第二次build成功 | 新增Rust／依賴鎖版／binary建置與散布；首次MSRV失敗保留，不能只記成功指令 |
| Tantivy產品adapter | Rust typed query、filters、TopDocs/count、lexicalrank與JSONL | IPC／deadline／crash處理、schema與token版本；目前單在途，不等於正式supervisor |
| 共用語義 | 32手寫案例，額外12筆同分反序fixture，E/L分開 | 必要搜尋與授權規格；跨引擎BM25不等價 |
| 中文詞項 | 手寫oracle排程期待錯誤，52欄實際index/query一致，批准另版修正 | ICU分詞版本與上下文效應需要明示；不證正式中文品質 |
| 資源控制 | systemd user units、外部deadline／finally stop、隔離工作目錄 | 研究控制器不等於公司K8s部署／告警／值班；未驗正式運維流程 |
| MinIO／更新／consumer接入 | G3a預載整合已實作並通過讀碼；第一次SQLite13項短測通過，正式混載未證 | 不借K5不同runtime證明Tantivy或N1已完成讀取／更新生命週期 |

執行等待由controller receipts記秒數；agent交錯工作與等待無可靠active人時切分，active工程人時／token金額目前未知，不用session牆鐘或LOC代替。依實驗卡維持兩項SQLite變更、單Tantivy reader路徑、明確修復attempt上限；G3前須另審共同API／資源／負載控制。

證據入口：`evidence/n1-native-20261117/`；失敗：`sqlite-vocab.json`、`tantivy-build-attempt1/`。成功建置不等於搜尋／容量通過。公開材料保持上次commit，這是本機新增研究。

G2 六區塊 3,780 次正式查詢通過，來源索引 hash 一致。G3a 新增2 Rust搜尋＋2 Node metadata程序管理、aggregate queue與fail-closed監督；SQLite對照4通用worker。Tantivy仍留完整SQLite，不能以99.9MB索引單獨估本站儲存。

首次G3a工具分開WSL呼叫，短測成功後兩unit同時被systemd停止，baseline儀器無效；保留原失敗，改單一持續控制程序，不改宿主linger。這是研究環境控制成本，不直接估為產品DevOps日常工時。

## 最終狀態（取代上方執行中欄位）

G1/G2/G3a限定結案，見DR_N1_OUTCOME_20261117.md及POSTREVIEW。Tantivy固定4CPU8GiB reader、另MinIO4CPU4GiB，baseline/W/M共12900正式任務全過；sequence2598.75秒含暖機等待及清理，不是人工工時。SQLite同資源基線過，W暖機deadline/pool關閉，未擴容：短樣本無CPU節流/OOM，根因仍未知。

G3b整包發布/下載/雙版切換/rollback未實作，不借過去SQLite runtime證據代替。所有本輪服務已停，54完整性核對通過。新增服務管理/IPC/雙資料源責任已具體化，但公司owner、日常工時與TCO仍未知。SQLite無tie TopK未測；不能以本輪E失敗宣告全面排除。
