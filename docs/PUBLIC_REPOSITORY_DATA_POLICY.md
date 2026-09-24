# Public repository data policy

Capital OS source control may be public, but production financial and identity data must not be.

## Do not commit

The following are excluded from the public repository:

- conversation attachments and imported prompt artifacts;
- UI screenshots or captures that may contain household, banking, brokerage, authentication, or operational data;
- local agent-memory files;
- generated certification logs;
- production household, document, transaction, account, source-object, session, or credential identifiers;
- production financial amounts when they are retained solely as operational evidence rather than reusable source fixtures.

Production certification target identifiers must be supplied through approved runtime configuration and must fail closed when missing. No production household or document identifier may be embedded as a source-code fallback.

## Certification evidence

Reusable certification specifications and public-safe historical summaries may remain in source control. Generated runtime evidence should be retained as bounded CI artifacts or in access-controlled evidence storage, not committed to the public repository.

## History limitation

Removing material from the current Git tree does not erase material that was previously published in Git history, forks, caches, or copies. Any credential that may have been exposed must be rotated rather than treated as safe merely because the current tree was cleaned.

## Review gate

`pnpm run check:public-repository-hygiene` is part of Capital OS CI. It rejects prohibited operational artifact directories, committed certification-log files, hard-coded production target fallbacks, and obvious production object/target identifiers in certification documentation.
