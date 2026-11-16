# K3 Web一般搜尋補驗

沒有 API consumer，Web 搜尋仍會影響閱讀。

[手機圖解](C_WEB_SEARCH_RESULT_20261116.html)／[獨立review](C_WEB_SEARCH_POSTREVIEW_20261116.md)。原2CPU/4GiB、MinIO4CPU/4GiB；無consumer/bulk/update；V1百萬筆。

|任務|搜尋整鏈P95 ms|閱讀P95 ms|研究門檻|
|---|---:|---:|---|
|只有閱讀，每秒 1 次|未量得|11.9|符合|
|每秒 1 個搜尋任務＋1 次閱讀|1,074.5|15.7|符合|
|每秒 2 個搜尋任務＋1 次閱讀|1,046|13.3|符合|
|每秒 4 個搜尋任務＋1 次閱讀|1,475.3|818.3|不符合|

每階30秒，搜尋SSR→九query結果，閱讀固定p1熱頁1/s。不是瀏覽器渲染SLO或正式流量；五text query browser smoke通過，filters/identity UI未實作。搜尋2s、reading max(2baseline,500ms)，baseline500ms/1%起跑。所有結論以raw/analysis分lane為準。停止=null；未執行=[]。

K2更新未完成保留，8GiB暫緩。下一步先在不改搜尋契約下分解count/filter/top10成本，再選SQL／資源／隔離備案；沒有批准省略total、降品質或加跑。A成本與正式吞吐未知，未比較B代A。

原K2 sources/build/DB SHA未改；74項凍結後驗無差異，installedV1相符；本輪服務已停止，Next清理143不是負載失敗。native runtime .lab/c-web-search-20261116，runner scripts/c-web-search-20261116；evidence/c-web-search-20261116含raw/status/resources/limits/ready/freeze/cleanup/browser。憑證僅native config不匯出。不覆寫K2證據。新成本為研究工具與驗證，非新產品元件，工程時間/token金額未知。
