---
name: Durable transfer classification
description: Why transfer and card-payment identity must persist independently from mutable review categories.
---

Transfer and credit-card payment classification must be persisted as a durable non-spending identity when a provider flags a transfer or a reviewer classifies one. Once set, later recategorization must not make the row household spending.

**Why:** Category choice and the budget-exclusion flag are mutable review state. Relying on either alone allowed a known card payment and potentially reclassified transfers to enter spending and cash-flow totals.

**How to apply:** Any import, review, replay, or seed path that identifies transfer-like activity must preserve its durable identity and fail closed in every household-spending projection.