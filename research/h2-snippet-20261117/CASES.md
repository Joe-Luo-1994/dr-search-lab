# H2 實際結果卡片對照

僅搜尋結果卡片，非文件／PDF viewer。全部為合成資料。標粗由文字與UTF16 ranges安全escape後產生，非任意innerHTML。原文／期待值見fixture；attempt1安全缺口與原碼保留。

## english

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> Daily <b>backup</b> protects documents.

## case

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> <b>BACKUP</b> and <b>Backup</b> are important.

## punctuation

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> <b>backup</b>, <b>restore</b>; verify!

## zh-word

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> 每天執行<b>備份</b>並驗證文件。

## zh-title

結果：PASS（attempt2）

**正文**：原文起點 fallback（UTF16）；NO_MAPPABLE_MATCH

> 這份文件提供操作說明。

**標題**：原文起點 0（UTF16）；NO_MAPPABLE_MATCH

> <b>備份</b>操作指南

## zh-mixed

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> 系統使用MinIO保存<b>備份</b>資料。

## english-title

結果：PASS（attempt2）

**正文**：原文起點 fallback（UTF16）；NO_MAPPABLE_MATCH

> This explains operating procedures.

**標題**：原文起點 0（UTF16）；NO_MAPPABLE_MATCH

> <b>Backup</b> guide

## middle

結果：PASS（attempt2）

**正文**：原文起點 801（UTF16）；MATCH

> roduction. Introduction. Introduction.  <b>backup</b> protects documents. Conclusion. Conclusion. Conclusion. Conclusion. Conclusion. Conclusion. Conclusion. Conclusio

## end

結果：PASS（attempt2）

**正文**：原文起點 1267（UTF16）；MATCH

> ction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction. Introduction.  Final <b>backup</b> instructions.

## multi

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> <b>backup</b> <b>recovery</b> procedures are documented here.

## phrase-caveat

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> <b>backup</b> is separate from <b>recovery</b> in this paragraph.

## pdf-lines

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> The disaster<br>recovery plan explains<br><b>backup</b> procedures.

## pdf-hyphen

結果：PASS（attempt2）

無結果／已抑制，不輸出原prefix。

## html

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; <b>backup</b> &amp; restore &lt;img src=x onerror=alert(1)&gt;

## emoji

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> ✅ <b>backup</b> protects café and documents 😀.

## accent

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> The <b>café</b> keeps a backup.

## combining

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> The <b>café</b> keeps a backup.

## missing

結果：PASS（attempt2）

無結果／已抑制，不輸出原prefix。

## denied

結果：PASS（attempt2）

無結果／已抑制，不輸出原prefix。

## repeated

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> <b>backup</b> recovery daily. <b>backup</b> recovery daily. <b>backup</b> recovery daily. <b>backup</b> recovery daily. <b>backup</b> recovery daily. <b>backup</b> recovery daily. <b>backup</b> recovery daily.

## zh-5000

結果：PASS（attempt2）

**正文**：原文起點 4850（UTF16）；MATCH

> 一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。一般說明。 此處提供<b>備份</b>操作。

## en-5000

結果：PASS（attempt2）

**正文**：原文起點 5861（UTF16）；MATCH

> xt. ordinary text. ordinary text. ordinary text. ordinary text. ordinary text. ordinary text. ordinary text. ordinary text. ordinary text.  <b>backup</b> instructions.

## unicode-5000

結果：PASS（attempt2）

**正文**：原文起點 5432（UTF16）；MATCH

> 😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。😀一般說明。 <b>café</b> <b>backup</b> 指南。

## distant-and

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> <b>backup</b> first. ordinary text. ordinary text. ordinary text. ordinary text. ordinary text. ordinary text. ordinary text. ordinary text. ordinary text. ordinary te

## mixed-edge

結果：PASS（attempt2）

**正文**：原文起點 0（UTF16）；MATCH

> <b>使用MinIO保存</b> 備份資料。

## oversize

結果：PASS（attempt2）

**正文**：原文起點 fallback（UTF16）；SOURCE_LIMIT

> ordinary ordinary ordinary ordinary ordinary ordinary ordinary ordinary ordinary ordinary ordinary ordinary ordinary ordinary ordinary ordinary ordinary ordinar

## source-missing

結果：PASS（attempt2）

**正文**：原文起點 fallback（UTF16）；SOURCE_MISSING

> backup content

## version-mismatch

結果：PASS（attempt2）

無結果／已抑制，不輸出原prefix。

## media-mismatch

結果：PASS（attempt2）

無結果／已抑制，不輸出原prefix。

## ranking-total-tie

結果：PASS（attempt2）

```json
{"id": "ranking-total-tie", "passed": true, "ids": ["rank1", "rank2", "rank3"], "scores": [{"pageId": "rank1", "score": 9.522761344909668}, {"pageId": "rank2", "score": 1.020755410194397}, {"pageId": "rank3", "score": 1.020755410194397}]}
```

## boundary-denied

結果：PASS（attempt2）

```json
{"id": "boundary-denied", "passed": true, "sourceReads": 0}
```

## boundary-unknown

結果：PASS（attempt2）

```json
{"id": "boundary-unknown", "passed": true, "sourceReads": 0}
```

## boundary-version

結果：PASS（attempt2）

```json
{"id": "boundary-version", "passed": true, "sourceReads": 0}
```

## boundary-media

結果：PASS（attempt2）

```json
{"id": "boundary-media", "passed": true, "sourceReads": 0}
```
