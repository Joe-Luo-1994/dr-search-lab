# Pagefind D1 執行前獨立審查

2026-11-16。唯讀審查卡片、runner、environment、trace generator 與實際生成副本；沒有執行查詢、服務或 build。

**裁定：無剩餘阻擋，可依凍結卡執行一次 D1。** 外部 controller 放行前仍須讀回 4 CPU／4 GiB／swap 0 及主機餘裕；失敗便停止。只允許同首題、完整操作 5 秒，沒有第二次預熱、延長或自動修補。

- 已對 native final freeze 的 **10,586 檔**逐檔重算 SHA，零差異。instrumentation inputs／outputs pins 全相符；從原 core／serve 與生成副本重新計算的 diff，與保存的 `instrumentation.patch` 完全一致。審查時尚無 control 目錄或 case.json。
- runner 為 `8317e6a309af8c5eb3ff037577fef2562f126bd44afbd5afb4cf8a495a84cce0`。原先只核 inventory 所列檔的缺口已 closed：現核實際名稱集合、檔案數、大小／SHA，拒絕特殊檔與未列檔。修正前未執行的 freeze 與 revision receipt 仍保留，並非結果後換版。
- 實際 core 差異只有 trace 與等價的 response 暫存；原 query normalization、Space／身份判斷、SQL、全部結果 mapping／去重、exact total、選取 10 筆及 response schema 保留。serve 只加 HTTP／資產階段記錄。text／corpus 與原版 bytes 相同。
- runner 只使用原 oracle 首題；HTTP、body、JSON、oracle 後 elapsed≥5 秒即失敗並保留 marker。外部 controller 真正停止程序組；runner 子程序清理有 SIGTERM→2 秒 SIGKILL，整組另有 900 秒上限。case 同步落盤，外部 kill 仍可能截斷後續 summary；應依原始紀錄解讀，不補造正常完成。
- trace 使用共用單 process FD，階段邊界與每 10k mapping 進度 write＋fsync，限制 1,000 events／1 MiB；超限或 trace I/O 錯誤 exit 70，須分類為觀測失敗。每筆帶此前已完成 trace 的 I/O／helper 累積成本，最後一筆自身開銷可能未知，不填零。asset.finish 表示 server 端傳輸完成事件，不等於 caller 已讀完。

本輪沿用 G2 完成的 Next build，但新 server／provider 首次載入；前置 hash 掃描會影響檔案 cache。少了編譯、加了 trace，因此不能以 D1 和 G2 的秒數差直接作效能因果結論。開始而未結束的 span 只能界定觀察窗口內的執行／等待階段。定位後即停止，下一改動另作決策；不修改原 G2 停止結果。
