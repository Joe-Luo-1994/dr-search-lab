# Pagefind 1.6.0 合成實驗

2026-11-10 Asia/Taipei，UTC log為11/09。固定npm版本／integrity與lockfile，獨立於root package。scripts/pagefind/probe.mjs用相同generator的100篇V1合成內容（含預先給定附件文字），以zh建立新隔離索引，真實Chromium載入產出bundle查詢。沒有重建現有fixture/build或ES。

8組查詢、10項檢查通過，包含刻意重現的共享全量索引client-filter反例。中文得到p07,p02,p01；錯字bakcup無結果；ops filter隱藏p11，移除filter取得p11與其文字。反例不等於所有Pagefind部署都不安全，通過也不等於正式授權通過。

原始查詢、取得的合成內容、產物各檔bytes/hash在result.json；沒有把生成的binary索引放到evidence。初次npm cache失敗與成功後續安裝見installation-notes.txt、install.log、repro-install.log。未量測正式容量／效能、未接MinIO/ReBAC/consumer。專篇見docs/PAGEFIND_ASSESSMENT.md；互動server與probe都在scripts/pagefind/。

官方參考：
- https://pagefind.app/docs/node-api/
- https://pagefind.app/docs/api/
- https://pagefind.app/docs/js-api-filtering/
- https://pagefind.app/docs/multilingual/
