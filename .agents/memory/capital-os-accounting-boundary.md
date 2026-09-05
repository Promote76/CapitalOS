---
name: Accounting overview boundary
description: The first Family Accounting view uses included household financial-account balances as its authoritative net-worth source.
---

The accounting overview must calculate current net worth from signed balances on financial accounts marked included in net worth: assets minus liabilities. Capital OS planning balances, property goals, financing scenarios, and Treasury planning buckets remain separate until an explicit reconciliation bridge exists. When a metric has no authoritative source, expose an explicit unavailable state rather than a fabricated zero.

**Why:** Those planning records can overlap conceptually with bank balances and are not owned-asset or actual-liability evidence; including them would double count household capital or imply unsupported valuation.

**How to apply:** Keep accounting read-only and clearly label data freshness, confidence, restricted balances, and tax-preparation disclaimers. Add new asset classes only when their source and reconciliation relationship are explicit.