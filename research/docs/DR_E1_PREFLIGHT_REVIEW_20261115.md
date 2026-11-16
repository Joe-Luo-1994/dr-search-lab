# E1執行前審查

2026-11-15。獨立reviewer `/root/v1_experiment_design_review`；主agent準備卡與runner，實作者 `/root/v1_e1_implementation` 寫provider／UI；reviewer從來源建立oracle，主agent反向核對oracle。不是正式產品接受。

## Oracle修訂（均在任何正式查詢前）

- 技術碼GTX-412：未有完整碼精確匹配的正式承諾。撤回實作者曾加的相鄰phrase規則，要求正確頁可找到，近似頁命中／排名列差異，保留需求未知。
- 主agent發現R09原oracle錯誤：a-pdf-near否定句仍含silverline及certificate，keyword AND不能因否定語意排除。reviewer修為total2、a-pdf必要、near合法詞面命中；來源不改，原錯誤及舊hash存ORACLE.md。
- Reviewer再核覆蓋：R04改all身份，讓可見但缺primary的b-relay成為真正AND禁止例，不以授權拒絕掩蓋字詞AND缺陷。案例總數23不變。
- 主agent核source、PDF hash、身份集合與responseInvariants；reviewer自身oracle不是獨立自我批准。語意接受仍只限合成卡。

## 初審及修正

prepare/index/build隔離路徑、拒覆寫、指定新索引HEAD404／create／writeblock讀回可準備。正式runner初審兩項阻擋：

1. 護欄只kill Next而UI可能繼續：改共用AbortController傳入UI，資源／全程watchdog關閉browser；UI task30秒Promise.race觸發關閉並停止後續tasks。保留結果及finally復原。取消機制是code review，未另做護欄觸發實驗。
2. build與freeze未有來源對應：首份成功build缺輸入前hash，保留在next-build-pre-receipt及build-prep.log。第二份記build前17個inputs、build後核一致並保存83個outputs收據；freeze核receipt與目前程式／產物，不補稱首份有證據。

另補build300秒watchdog，Windows只終止本輪spawn的build子程序樹。ES索引先count再write-block讀回，README更正membership引用為readonly-release lib而非MR1舊附件程式。

## 定向複核裁定

Reviewer回覆：「兩項均closed，可完成freeze後執行本卡。」實際核對build-attempt／receipt的17個inputs、83個outputs共100個當前hash，皆相符；attempt與receipt輸入和開始時間一致。共用UI取消與停止後續task的程式路徑確認。

此裁定不代表功能／畫面通過，PDF畫面與正式run原始結果需執行後review。沒有為了取得批准反覆加review輪；一次完整code review、一次定向複核。Token／費用未知。
