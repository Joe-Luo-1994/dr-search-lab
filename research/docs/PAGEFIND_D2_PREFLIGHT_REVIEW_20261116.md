# Pagefind D2 執行前獨立審查

2026-11-16。唯讀審卡、generator、environment、runner 與生成證據，沒有執行服務或 query。

**裁定：可依凍結卡單次執行，無剩餘阻擋。** controller 放行前須讀回 4 CPU／4 GiB／swap 0 與主機餘裕；runner 須完成實際 artifact 名稱集合及逐檔 SHA 核對。維持同首題一次、5 秒外部停止，不因逾時自動擴容。

- native final freeze **10,707 檔**獨立重算 SHA，零差異；審查時尚無 control／case。
- 實際 generated JS 逆序撤銷 18 項列明替換後，與原 text 完全相同；實際差異與保存 patch 相符。原／新 JS SHA、原 inventory 與新 diagnostic inventory pin 均相符。
- 新 inventory 共 **101,571 檔**，與原 inventory 比較只有 `pagefind/pagefind.js` SHA 異動。這是明示的儀器副本，不宣稱整包與原 bytes 完全相同；本次 review 沒有額外重掃全部產物 bytes，該工作由已審 runner 在送出唯一 query 前完成。
- D1 core／serve／trace helper 副本 SHA 全同。runtime 新觀測分開 fetch headers、body 收取、解壓、WASM 初始化／載入／搜尋、UTF-8 decode、JSON parse 與全結果 JS 建構；未變更 filter、排序、原 Promise 等待或全結果義務。trace 成本與最後一筆自身成本未知的口徑保留。
- 資源僅分析約覆蓋 query 的已觀測樣本區間，未覆蓋端點不外推；缺 query.end 時以停止證據限定，不納入清理當查詢。refault 或 timeout 單獨不足以證明擴容收益，需壓力證據與具體可否證預測，再決定唯一資源候選。

本 gate 只批准這一次定位，不預先判斷 Pagefind 成敗、純 WASM 瓶頸或加 CPU／RAM 有效。
