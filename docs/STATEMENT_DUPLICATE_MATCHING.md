# Statement Duplicate Matching

## Matching rule

Matching is household-scoped and happens before a new official transaction is
created. The current implementation first restricts candidates to the same
household, statement account, posted date, and exact signed normalized amount.
It then retains candidates when at least one of the following agrees:

- normalized statement description and official description;
- normalized statement reference and official description;
- normalized statement description/reference and official merchant; or
- deterministic statement-row fingerprint.

Text normalization trims, collapses whitespace, and lowercases using
`en-US`. Amounts are exact signed cents, including corrected source amount when
present. Amount alone is never sufficient; account, date, signed cents, and a
source-identity text/fingerprint dimension are all part of the current
candidate path.

The fingerprint is SHA-256 over household ID, account ID, posted date, signed
amount, normalized description, merchant, reference, and provider transaction
ID when supplied. The import path currently supplies description and reference
(and account/date/amount); provider IDs and merchant are supported by the
fingerprint function but are not populated by this bridge call.

## Outcomes and human choice

The preview returns:

- `NO_MATCH`: import as new may proceed after the other inclusion checks.
- `ONE_HIGH_CONFIDENCE_MATCH`: a human can link that sole candidate.
- `MULTIPLE_CANDIDATES`: creation/link is blocked; a human must resolve the
  duplicate situation rather than choose by amount.
- `EXACT_ALREADY_LINKED`: an inclusion already exists for the row.
- `KNOWN_DUPLICATE`: the row’s durable inclusion was reversed.

Candidate responses identify account, date, exact amount, description,
merchant, category, confidence, and matching reasons. A link request
revalidates the target rather than trusting client preview data. It requires
the sole candidate and a matching selected category/account.

## Exact-once protection

An inclusion exists once per household + statement row and once per household +
statement fingerprint. The service locks the row before matching/creating and
uses idempotency keys. Repeated or simultaneous import attempts cannot produce
two official transactions for that row. A reversed inclusion remains a durable
duplicate barrier, rather than freeing the source row for another import.

Duplicate resolution and matching are auditable through inclusion records and
audit events. This policy does not claim fuzzy merchant scoring, date windows,
provider-ID matching in the live query, or automatic duplicate exclusion beyond
the dimensions described above.
