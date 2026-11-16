# Pagefind：團隊選型補充審查

2026-11-16。**現有證據不足以排除Pagefind。** 它應在報告中列為有成功子證據、仍值得有界評估的搜尋候選；不能只寫成SQLite的歷史淘汰者。本次只讀歷史審查與原始build紀錄，沒有新增建置、搜尋或壓測。

## 能力與真正限制

| 可追溯證據 | 能說什麼／不能說什麼 |
|---|---|
| [真Next第二輪獨立審查](../evidence/decision-review-20261115/history/docs/reviews/two-rounds-2026-11-14/round-2-review.md)：12頁，Pagefind與SQLite各18/18，合計52 HTTP | Pagefind server API、中文／英文／代碼、分頁、正文／附件與mock scope有小型成功證據。不是正式consumer、ReBAC或百萬容量驗收。highlight=null為當時允許，不代表正式接受 |
| 同輪冷查詢fragment GET 5→0；缺PF產物不再牽連SQLite／正文／附件 | 後來修正要保留，不能沿用第一輪問題宣稱必然失敗。代價包含build期ID／scope mapping、驗hash與版本維護；不是零IO或零自製adapter |
| [MS1獨立審查](../evidence/decision-review-20261115/history/docs/reviews/ms1-2026-11-14/final-review.md)：10k build 12.348秒、取樣程序樹RSS957.99MiB，短API工作集通過 | 有10k可用產物與短任務證據；極短closed-loop窗口不能當穩態QPS |
| [100k原始build紀錄](../evidence/decision-review-20261115/history/evidence/ms1-2026-11-14/implementation/pagefind-100000-build.json)：`TREE_RSS_LIMIT`，102.8545秒，峰6,505,082,880 bytes，護欄6144MiB | ingest完成後write階超當時程序樹RSS軟預算，未產有效bundle；100k reader及1M未跑。不是reader只能10k，也不是任何配置都無法建100k |
| [歷史重判](PAGEFIND_DECISION_REVIEW_20261115.md)：同100頁bundle的「資料庫備份」Node1筆、browser3筆 | 中文parity反例不能被後來不同fixture成功抹掉；是否影響必要任務仍需對口與來源案例判斷。browser公開全量私有索引的授權反例，也不能直接套成server模式必敗 |

## 對照是否公平

SQLite後來獲得長駐worker、版本流程調整與多次受控擴容，K5最終reader8CPU／12GiB／8workers加另配MinIO，完成不同的百萬合成工作點；Pagefind較大的建置分支仍停在舊100k／6GiB預算。**兩者投入與契約不對等，不能用這段歷史推導SQLite全面優於Pagefind。** 當時MS1的SQLite百萬極深分頁也超時，未通過完整工作集；後來範圍與實作變更須明示。

公平不等於直接把reader的12GiB套給Pagefind builder：中央建置與每站服務應分帳，硬cgroup與取樣RSS也不是同一量測。Pagefind若需要較大但短暫的中央資源，可能仍換得每站收益；反之，bundle檔案數、映射與版本耦合也可能增加維運。本機舊實作曾解析1.6.0內部fragment格式，且使用SQLite存映射，不能宣稱替換後所有SQLite／自製程式責任自然消失。

## 下一個有界gate與改選條件

若團隊願意繼續這個候選，下一張卡應只回答：**在可承擔的集中建置預算內，能否完成100k可發布且可驗證的Pagefind產物？** 先列明固定來源／版本、CPU／RAM／磁碟／總期限、主機餘裕及artifact／mapping完整性；預算依團隊可部署環境決定，不從舊線性推估捏造。只允許一次固定配置，不在失敗後無上限加RAM；保留舊失敗。

通過後只做少量source oracle／舊中文反例的server查詢確認，才具備討論下一階reader或百萬建置的依據，**不自動接全引擎矩陣或宣稱百萬已過**。超預算、無完整產物、必要授權／資料錯誤即停；結果只限定該配置／契約，並非永久淘汰。此為待核准的下一步設計，尚未執行。

改選需要的是：必要搜尋與consumer差異可接受、中央建置成本可承擔，而且Pagefind的搜尋／更新／版本整合總維護責任有證據少於SQLite方案；不能只因能build或「靜態搜尋」就選它。若其好處不足以抵銷mapping／adapter維護，保留SQLite或A仍合理。A是完整stack基準，B保留ES但仍有應用轉接；Pagefind只替換搜尋provider，正式匯出、內容、授權與發布共同責任不會因此消失。

公開討論材料可呈現上述結論與摘要；原始fixture、執行程式、私有設定與完整環境紀錄不屬本次發布範圍。公開版應清楚標示尚未執行的新gate，不把研究提案包裝成已完成實驗。
