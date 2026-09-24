# Production Financial-Document Remediation Certification — 2026-09-08

## Historical result

**PRODUCTION DOCUMENT REMEDIATION: BLOCKED**

This document preserves the public-safe certification conclusion from the 2026-09-08 production-remediation review. Production-specific household identifiers, document identifiers, transaction identifiers, private object paths, filenames, and exact household financial amounts have been intentionally removed from the public repository.

The managed Publish flow had applied the required additive integrity schema and the read-only preflight had identified two production financial documents whose content-based classification required authorized review. No production mutation was completed because the required authenticated production operator boundary and canonical business-entity prerequisite were not both satisfied.

The blocking conditions were:

- `PRODUCTION_CLERK_OPERATOR_SESSION_REQUIRED`;
- `BUSINESS_ENTITY_LINK_REQUIRED`.

No ad hoc production SQL, source-object deletion, duplicate-business creation, simulated correction, brokerage action, bank write, or money movement was performed.

## Public-safe evidence summary

- Required schema changes were additive and applied through the managed release path.
- Private source evidence remained preserved.
- Two production records were identified as high-confidence business P&L candidates requiring explicit authorized correction.
- Production correction remained blocked.
- Existing document-to-budget certification evidence remained separate from the blocked production remediation.
- AI authority remained advisory only.
- Bank write authority remained none.
- Real-money movement remained zero.
- Micro-Live remained disabled.

Exact production identifiers and household financial observations are operational data and are not retained in public source documentation.

## Published-origin remediation runner

The bounded remediation runner requires all production targets to be supplied explicitly at runtime:

```text
CAPITAL_OS_PUBLISHED_ORIGIN=https://<published-origin> \
CAPITAL_OS_PRODUCTION_OPERATOR_SESSION_COOKIE='[approved Clerk session cookie]' \
CAPITAL_OS_PRODUCTION_HOUSEHOLD_ID=<approved-production-household-id> \
CAPITAL_OS_PRODUCTION_DOCUMENT_IDS=<approved-document-id-a>,<approved-document-id-b> \
CAPITAL_OS_PRODUCTION_BUSINESS_ID=<existing-business-id> \
node scripts/certify-production-document-remediation.mjs
```

The repository contains no default production household or document IDs. Missing target configuration fails closed before remediation can proceed.

The session must belong to the Clerk instance that owns the target household. The runner rejects missing or malformed production configuration, household mismatches, and non-approver memberships. It never creates a household, source object, bank record, verified-income event, or money-movement event.

## Browser-backed certification

The browser-backed path likewise requires explicit runtime target configuration:

```text
CAPITAL_OS_BROWSER_ORIGIN=https://<published-origin> \
CAPITAL_OS_PRODUCTION_HOUSEHOLD_ID=<approved-production-household-id> \
CAPITAL_OS_PRODUCTION_DOCUMENT_IDS=<approved-document-id-a>,<approved-document-id-b> \
pnpm run certify:production-document-remediation-browser
```

Operator credentials must be supplied only through approved environment-secret channels. The browser flow verifies the authenticated household and approver boundary before any protected remediation action.

## Evidence policy

Generated production certification logs belong in ephemeral or access-controlled evidence storage. They are ignored by the public repository and should be uploaded as bounded CI artifacts when retention is required.

Historical Git commits may still contain material that was previously public. Removal from the current tree is not equivalent to erasure from Git history.

## Decision

The 2026-09-08 result remains **BLOCKED**, not PASS. This historical document does not establish current production readiness.
