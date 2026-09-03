# Micro-Live certification evidence

Micro-Live certification is an evidence gate, not a declaration that the
repository contains a live venue. The verifier remains `DISABLED` unless an
operator supplies a venue-bound evidence manifest through
`MICRO_LIVE_CERTIFICATION_EVIDENCE`.

The manifest must be produced from an isolated run against one reviewed
provider venue. It must contain:

- exactly one non-simulated, non-provider-neutral venue;
- the provider adapter identity and independent security and jurisdiction
  review references;
- one dedicated `micro_live` account with household and protected capital
  inaccessible;
- a manually funded $20 envelope, one strategy/version, and a non-empty
  market allowlist;
- evidence references and ISO timestamps for ML-02, ML-03, ML-09, ML-13,
  ML-16, ML-17, and ML-20;
- read-only transport, durable restart recovery, authenticated browser
  arming, and first-fill hold evidence;
- an explicit `limitedLiveStatus` of `LOCKED`.

An evidence reference is only a pointer to independently retained execution
evidence; it is not a credential, fill record, or funding record. Do not put
secrets, access tokens, account credentials, or sensitive provider responses in
the manifest. A missing manifest, malformed manifest, stale evidence, or
missing critical gate leaves Micro-Live `DISABLED`. A manifest does not enable
real execution by itself and never unlocks Limited-Live.

The application-side registration contract also requires both review
references, rejects duplicate provider registrations, and rejects venue
capabilities for withdrawals, transfers, administration, or security changes.
The rehearsal adapter remains non-transmitting.