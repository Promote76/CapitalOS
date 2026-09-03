# Micro-Live certification evidence

Micro-Live certification is an evidence gate, not a declaration that the
repository contains a live venue. The verifier remains `DISABLED` unless an
operator supplies a venue-bound evidence manifest through
`MICRO_LIVE_CERTIFICATION_EVIDENCE`.

The manifest must be produced from an isolated run against one reviewed
provider venue. It must contain:

- `manifestVersion: 1`, `isolatedRun: true`, and a non-empty operator run ID;
- exactly one non-simulated, non-provider-neutral venue;
- the provider adapter identity, an opaque server-side credential reference,
  and independent security and jurisdiction review objects. Each review must
  include a distinct reviewer ID, a current `reviewedAt`, a future `expiresAt`,
  and a matching review reference;
- one dedicated `micro_live` account with household and protected capital
  inaccessible;
- a manually funded $20 envelope with a retained evidence reference, one
  strategy/version, and a non-empty market allowlist;
- retained evidence references and current ISO timestamps for ML-02, ML-03,
  ML-07, ML-09, ML-12, ML-13, ML-16, ML-17, and ML-20;
- read-only transport, durable restart recovery, authenticated browser
  arming, reconciliation, Guardian, and first-fill hold evidence. The
  first-fill evidence must identify at least one observed real fill and must
  keep the notional at or below the $1 order limit;
- an explicit `limitedLiveStatus` of `LOCKED`.

Retained evidence references must use the opaque
`evidence://capital-os/<reference>` form and every evidence timestamp must be
no more than 90 days old (with a small clock-skew allowance). A reference is
only a pointer to independently retained execution evidence; it is not a
credential, fill record, or funding record. Do not put secrets, access tokens,
account credentials, raw provider responses, or fabricated fills/funding in
the manifest. A missing manifest, malformed manifest, stale evidence, or
missing critical gate leaves Micro-Live `DISABLED`. A manifest does not enable
real execution by itself and never unlocks Limited-Live.

The application-side registration contract also requires both review
references, rejects duplicate provider registrations, and rejects venue
capabilities for withdrawals, transfers, administration, or security changes.
The rehearsal adapter remains non-transmitting.