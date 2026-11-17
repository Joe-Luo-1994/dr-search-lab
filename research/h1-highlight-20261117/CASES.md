# H1 案例對照

原文與查詢為合成資料。以下包含失敗，未修正期待值以配合結果。搜尋契約是AND詞項，不宣稱片語。完整原文見 fixture.json。

## english — PASS

查詢：`backup`；搜尋命中：True。失敗：無

原文（前300字；完整內容見fixture）：
```text
Daily backup protects documents.
```

**body：現有前160字**
```text
Daily backup protects documents.
```
**官方摘要／highlight**
> Daily <b>backup</b> protects documents

**title：現有前160字**
```text
Guide
```
**官方摘要／highlight**
> （空）

## case — PASS

查詢：`backup`；搜尋命中：True。失敗：無

原文（前300字；完整內容見fixture）：
```text
BACKUP and Backup are important.
```

**body：現有前160字**
```text
BACKUP and Backup are important.
```
**官方摘要／highlight**
> <b>BACKUP</b> and <b>Backup</b> are important

**title：現有前160字**
```text
Guide
```
**官方摘要／highlight**
> （空）

## punctuation — PASS

查詢：`backup restore`；搜尋命中：True。失敗：無

原文（前300字；完整內容見fixture）：
```text
backup, restore; verify!
```

**body：現有前160字**
```text
backup, restore; verify!
```
**官方摘要／highlight**
> <b>backup</b>, <b>restore</b>; verify

**title：現有前160字**
```text
Guide
```
**官方摘要／highlight**
> （空）

## zh-word — FAIL

查詢：`備份`；搜尋命中：True。失敗：body:missing 備份

原文（前300字；完整內容見fixture）：
```text
每天執行備份並驗證文件。
```

**body：現有前160字**
```text
每天執行備份並驗證文件。
```
**官方摘要／highlight**
> （空）

**title：現有前160字**
```text
指南
```
**官方摘要／highlight**
> （空）

## zh-title — FAIL

查詢：`備份`；搜尋命中：True。失敗：title:missing 備份

原文（前300字；完整內容見fixture）：
```text
這份文件提供操作說明。
```

**body：現有前160字**
```text
這份文件提供操作說明。
```
**官方摘要／highlight**
> （空）

**title：現有前160字**
```text
備份操作指南
```
**官方摘要／highlight**
> （空）

## zh-mixed — FAIL

查詢：`備份`；搜尋命中：True。失敗：body:missing 備份

原文（前300字；完整內容見fixture）：
```text
系統使用MinIO保存備份資料。
```

**body：現有前160字**
```text
系統使用MinIO保存備份資料。
```
**官方摘要／highlight**
> （空）

**title：現有前160字**
```text
Guide
```
**官方摘要／highlight**
> （空）

## english-title — PASS

查詢：`backup`；搜尋命中：True。失敗：無

原文（前300字；完整內容見fixture）：
```text
This explains operating procedures.
```

**body：現有前160字**
```text
This explains operating procedures.
```
**官方摘要／highlight**
> （空）

**title：現有前160字**
```text
Backup guide
```
**官方摘要／highlight**
> <b>Backup</b> guide

## middle — PASS

查詢：`backup`；搜尋命中：True。失敗：無

原文（前300字；完整內容見fixture）：
```text
Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introd
```

**body：現有前160字**
```text
Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introd
```
**官方摘要／highlight**
> Introduction. Introduction. Introduction. Introduction. Introduction.  <b>backup</b> protects documents. Conclusion. Conclusion. Conclusion. Conclusion. Conclusion

**title：現有前160字**
```text
Guide
```
**官方摘要／highlight**
> （空）

## end — PASS

查詢：`backup`；搜尋命中：True。失敗：無

原文（前300字；完整內容見fixture）：
```text
Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introd
```

**body：現有前160字**
```text
Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introd
```
**官方摘要／highlight**
> Introduction.  Final <b>backup</b> instructions

**title：現有前160字**
```text
Guide
```
**官方摘要／highlight**
> （空）

## multi — PASS

查詢：`backup recovery`；搜尋命中：True。失敗：無

原文（前300字；完整內容見fixture）：
```text
backup recovery procedures are documented here.
```

**body：現有前160字**
```text
backup recovery procedures are documented here.
```
**官方摘要／highlight**
> <b>backup</b> <b>recovery</b> procedures are documented here

**title：現有前160字**
```text
Guide
```
**官方摘要／highlight**
> （空）

## phrase-caveat — PASS

查詢：`backup recovery`；搜尋命中：True。失敗：無

原文（前300字；完整內容見fixture）：
```text
backup is separate from recovery in this paragraph.
```

**body：現有前160字**
```text
backup is separate from recovery in this paragraph.
```
**官方摘要／highlight**
> <b>backup</b> is separate from <b>recovery</b> in this paragraph

**title：現有前160字**
```text
Guide
```
**官方摘要／highlight**
> （空）

## pdf-lines — PASS

查詢：`backup`；搜尋命中：True。失敗：無

原文（前300字；完整內容見fixture）：
```text
The disaster
recovery plan explains
backup procedures.
```

**body：現有前160字**
```text
The disaster
recovery plan explains
backup procedures.
```
**官方摘要／highlight**
> The disaster<br>recovery plan explains<br><b>backup</b> procedures

**title：現有前160字**
```text
Guide
```
**官方摘要／highlight**
> （空）

## pdf-hyphen — PASS

查詢：`backup`；搜尋命中：False。失敗：無

原文（前300字；完整內容見fixture）：
```text
The back-
up procedure is described.
```

## html — PASS

查詢：`backup`；搜尋命中：True。失敗：無

原文（前300字；完整內容見fixture）：
```text
<script>alert("x")</script> backup & restore <img src=x onerror=alert(1)>
```

**body：現有前160字**
```text
<script>alert("x")</script> backup & restore <img src=x onerror=alert(1)>
```
**官方摘要／highlight**
> &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; <b>backup</b> &amp; restore &lt;img src=x onerror=alert(1

**title：現有前160字**
```text
Guide
```
**官方摘要／highlight**
> （空）

## emoji — PASS

查詢：`backup`；搜尋命中：True。失敗：無

原文（前300字；完整內容見fixture）：
```text
✅ backup protects café and documents 😀.
```

**body：現有前160字**
```text
✅ backup protects café and documents 😀.
```
**官方摘要／highlight**
> ✅ <b>backup</b> protects café and documents

**title：現有前160字**
```text
Guide
```
**官方摘要／highlight**
> （空）

## accent — PASS

查詢：`café`；搜尋命中：True。失敗：無

原文（前300字；完整內容見fixture）：
```text
The café keeps a backup.
```

**body：現有前160字**
```text
The café keeps a backup.
```
**官方摘要／highlight**
> The <b>café</b> keeps a backup

**title：現有前160字**
```text
Guide
```
**官方摘要／highlight**
> （空）

## combining — FAIL

查詢：`café`；搜尋命中：True。失敗：body:missing café

原文（前300字；完整內容見fixture）：
```text
The café keeps a backup.
```

**body：現有前160字**
```text
The café keeps a backup.
```
**官方摘要／highlight**
> （空）

**title：現有前160字**
```text
Guide
```
**官方摘要／highlight**
> （空）

## missing — PASS

查詢：`backup`；搜尋命中：False。失敗：無

原文（前300字；完整內容見fixture）：
```text
Only recovery instructions.
```

## denied — PASS

查詢：`backup`；搜尋命中：False。失敗：無

原文（前300字；完整內容見fixture）：
```text
SECRET backup instructions.
```

## repeated — PASS

查詢：`backup`；搜尋命中：True。失敗：無

原文（前300字；完整內容見fixture）：
```text
backup recovery daily. backup recovery daily. backup recovery daily. backup recovery daily. backup recovery daily. backup recovery daily. backup recovery daily. backup recovery daily. backup recovery daily. backup recovery daily. backup recovery daily. backup recovery daily. backup recovery daily. b
```

**body：現有前160字**
```text
backup recovery daily. backup recovery daily. backup recovery daily. backup recovery daily. backup recovery daily. backup recovery daily. backup recovery daily.
```
**官方摘要／highlight**
> <b>backup</b> recovery daily. <b>backup</b> recovery daily. <b>backup</b> recovery daily. <b>backup</b> recovery daily. <b>backup</b> recovery daily. <b>backup</b> recovery daily. <b>backup</b> recovery daily

**title：現有前160字**
```text
Guide
```
**官方摘要／highlight**
> （空）
