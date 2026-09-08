# Financial Document Duplicate and Version Policy

A household document hash is an exact identity boundary. Re-uploading the same hash returns the existing evidence and writes an audit event instead of creating a second financial document.

Similar filenames with different hashes are never merged automatically. Identity review compares hash, observed size, selected/detected type, period, statement date, recognized totals, and parser evidence. Review outcomes are explicit:

- `EXACT_DUPLICATE`
- `PROBABLE_DUPLICATE`
- `DISTINCT_PERIOD`
- `DISTINCT_VERSION`
- `CORRECTED_VERSION`
- `UNKNOWN_REVIEW_REQUIRED`

Canonical, duplicate, and version metadata are persisted on the financial document and the comparison decision is append-audited. Marking a duplicate excludes it from future authority decisions but does not delete its source object or historical evidence. Physical retention/deletion is a separate action outside this sprint.