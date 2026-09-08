# Statement Reversal Policy

## Never silently delete official activity

When a statement source was imported incorrectly, the bridge preserves source
evidence and official-history traceability. It does not silently delete the
official transaction. The two available service actions are intentionally
different:

- **Unlink** applies to any active inclusion, including a link to an existing
  official transaction. It reverses the provenance inclusion.
- **Reverse import** applies only to `IMPORTED_NEW`. In addition to reversing
  the inclusion, it sets the transaction created by the bridge to
  `excludedFromBudget = true` and adds reversal/reconciliation metadata. The
  official transaction and its source IDs remain stored.

Both require `approve` permission, a reason, an idempotency key, and an active
non-reversed inclusion. They are serialized per statement row. They transition
the inclusion to `REVERSED`, record actor/time on the inclusion, and append a
`statementFinancialReversals` record containing inclusion/row/official IDs,
before and after state, reason, actor, and timestamp. An audit event is also
written.

## Consequences and limits

Because reverse import excludes the created official transaction from Budget,
subsequent Budget/Accounting/cash-flow views that honor existing exclusion
rules stop counting it as eligible household spending. The implementation does
not delete the evidence or transaction, mutate bank balances, or create a
replacement transaction automatically. Reversal is terminal in the inclusion
state machine; re-import/link requires explicit reconciliation outside this
operation.

Unlinking a pre-existing transaction does not delete or otherwise rewrite that
target transaction. It removes the statement inclusion by marking it reversed.

## Mismatch troubleshooting

Review the Financial Review Queue for `source_official_mismatch` items. A
mismatch is raised when:

1. a post-import source amount correction differs from the official amount;
2. category or economic classification changes after an active inclusion; or
3. the parent source document is later rejected.

The inclusion will show `reviewRequired`, mismatch code
`SOURCE_OFFICIAL_MISMATCH`, and reconciliation status `REQUIRED`. Investigate
the immutable source/correction history and the official transaction before
choosing an operational remedy: explicitly correct official activity using the
appropriate official-transaction workflow, unlink provenance where appropriate,
or reverse a bridge-created import. Do not expect source correction or parent
rejection to change the official row automatically.

To close an outstanding bridge reconciliation without changing official values,
an approver can call the inclusion reconciliation action with a reason and
idempotency key. It records `RESOLVED`, actor/time, and an audit event. That
acknowledges the mismatch review; it is not an official transaction correction.

## Common blocked operations

- **“No active inclusion to reverse”**: the row was never included or is
  already reversed.
- **“Reverse import only applies…”**: use unlink for a linked-existing row.
- **“Reversed evidence cannot be imported/linked…”**: preserve exact-once
  history and complete explicit reconciliation; do not retry with a new key.
- **Source document rejected**: unresolved rows are rejected, but existing
  official links are flagged for review rather than removed.
