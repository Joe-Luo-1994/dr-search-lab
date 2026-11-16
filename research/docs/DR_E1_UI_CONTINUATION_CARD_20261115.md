# E1-F1 UI 剩餘四項補驗：只修定位/等待的證據缺口

原 F1 result.json 保持 passed=false；6 API、清已開正文及 none 空結果已通過，不再重跑。unknown 的斷言當時沒有存下 alert 內容，network 尚未記 unknown 回應，原因不能只靠猜測。

唯一新執行：先保存原頁面 role=alert DOM（含 shadow root host），再切 unknown 搜尋 relay，等對應 HTTP response/body，保存所有 alert DOM。產品錯誤限定 main 的 alert，必須 503 AUTHORIZATION_UNKNOWN 且畫面說無法確認權限、不是無結果。若資料顯示原斷言過早匹配 framework announcer，才可判定位/等待問題。

接續只做尚未完成的 desktop搜尋、身份清空、延遲舊身份回應隔離；共4項。後者先記真 C 200/10 hits、切 none、釋放 held response，等 route fulfill/取消事件收尾，再檢查畫面；另外保存 browser requestfailed 以區分 abort 與成功交付。沒有 PDF/Tags/API 矩陣重跑，不修改產品。

沿用已準備的正常 Node22/Edge157、唯讀 C PID23416；60秒整輪 browser-close watchdog、每操作5秒、route fetch5秒、ready6秒。無新安裝/ES/fixture。先前可用RAM約19GiB、磁碟約391GiB；本次最多2截圖和小JSON，非容量試驗、無CPU/RAM硬quota。執行前後核120hash，檢查Role baseline。新檔各自 wx，原result不覆蓋。失敗保存並停止，不再自動補跑。主agent實作，reviewer先審追加理由、事後獨立判結果。token/金額未知。
