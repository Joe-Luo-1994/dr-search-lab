# 團隊選型報告：異地只讀 DR

主入口：[手機／桌面 HTML 報告](DR_TEAM_DECISION_20261116.html)。以使用目標→機制與證據→架構→容量→C落地→維運差額→條件決策組織，取代要求讀者自行拼接歷史實驗頁。各細節可展開，提供展開全部與列印；列印時展開所有內容。未對外發布。

## 交付結論

建議保留A完整架構作可行基準，C作值得評估導入的候選。本次請團隊確認必要任務與可接受差異、C六工作包的沿用／適配／新增與owner，再選最可能翻轉選型的一個未知。不是C正式採用批准，不是A/C成本優勝判定。

使用者最新補充優先：A主要剩ES同步是目前理解，尚非公司完整還原證據；自動化不讓ES容量／磁碟／修補責任歸零。A資料未取得不阻塞C具體工作盤點。C不是只管理MinIO，還有中央產製／發布與Pod本地DB／worker／版本生命週期。

六包：正式資料匯出；搜尋與consumer API；閱讀下載與授權；集中建置發布；Web Pod版本生命週期；部署監控與交接。角色是建議、未承諾；沿用研究機制不等於production組件。具體內容在HTML及 `evidence/team-decision-20261116/work-packages.json`。

## 主要證據與界線

| 問題 | 來源 | 報告允許的結論 |
|---|---|---|
| 基本搜尋、Space/Tags、PDF與身份UI | DR_E1_RESULT + DR_E1_FOLLOWUP_REVIEW | 37頁合成必要任務有限結案；原時間戳與UI失敗保留。ES為B參照，非完整A。正式品質未驗 |
| 本地搜尋、遠端正文／附件 | DR_REMOTE_CONTENT_RESULT + POSTRUN_REVIEW | 17組／40API受控流程；MinIO失聯時搜尋可用但內容不可用。PDF下載不等於該輪視覺render驗收 |
| 百萬頁混合流量＋更新 | C_SCALE_RESULT + POSTREVIEW + OPERATIONS_LEDGER | R1更新完成，但更新階5/1620任務被拒且體驗門檻未全過；R2通過；reader8CPU12GiB8workers，MinIO另4CPU4GiB。非最低資源／正式容量／完整RTO |
| 重啟版本發現 | C_RESTART_RESULT + POSTREVIEW | 小fixture六案例，startup-only；未與K5整合，不合成同build全通過 |
| C落地／成本 | DR_LANDING_SCOPE、DR_SELECTION_DELTA | 六工作包是估範圍材料；A增量／正式人時未知，B不可代A |
| Pagefind | PAGEFIND_DECISION_REVIEW | 小型Next成功、100k/6GiB builder失敗及中文反例均保留，不永久排除 |

ES snapshot→異地完整repository→rename restore→alias切換是官方能力組成的候選設計，尚未公司實測。alias切換只涵蓋ES，不涵蓋MariaDB/MinIO；應核錯誤、版本相容與多action條件。來源2026-11-16重查：

- https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/restore-snapshot
- https://www.elastic.co/docs/manage-data/data-store/aliases
- https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/self-managed

## 製作與驗收

來源 `scripts/team-decision-20261116/build.mjs`；自包含HTML，沒有外部字型／JS或遙測。借用既有報告的連續閱讀與就地證據模式；UX skill的簡潔、高對比、層級與留白建議適用，行銷CTA模板／外部字型未採用。此為設計判斷，非真人研究結論。

本輪只生成報告與檢查瀏覽器。獨立review在 `DR_TEAM_DECISION_REVIEW_20261116.md`，UI結果在 `evidence/team-decision-20261116/`。agent token金額與公司人時未知。未修改服務、舊實驗或正式部署，沒有新benchmark。
