---
name: PDF evidence extraction
description: Durable parsing constraints for treating extracted business PDF evidence as reviewable.
---

`pdftotext` can emit a trailing form-feed after the final page and can place page separators inside an extracted line. Normalize trailing output before page counting, and preserve page boundaries while extracting line items.

**Why:** Counting raw form-feeds overstates page count, while treating all extracted lines as page 1 loses the source location needed for review and regression diagnosis.

**How to apply:** Keep representative multi-page settlement and P&L fixtures in parser tests, assert page-specific line attribution, and mark conflicting labeled totals ambiguous instead of selecting a value silently.