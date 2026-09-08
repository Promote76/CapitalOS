# Capital Governor V2 Certification

Date: 2026-09-07

The certification command is:

```sh
pnpm run certify:capital-governor-v2
```

The deterministic domain suite covers the following gates:

- **CG2-01** account cash does not equal Safe-to-Deploy;
- **CG2-02** business cash is excluded;
- **CG2-03** Duplex Reserve remains protected;
- **CG2-04** emergency and vehicle reserve gaps are explicit;
- **CG2-05** deductions are not double-counted;
- **CG2-06** forecast shortfall blocks deployment;
- **CG2-07** stale and incomplete evidence fails closed;
- **CG2-08** floor/base/strong surplus behavior is separated;
- **CG2-09** waterfall recommendations are deterministic and advisory;
- **CG2-10** protected capital cannot authorize movement;
- **CG2-11** Micro-Live and Strategy Lab have no authority;
- **CG2-12** tenant and actor scope is enforced by the service;
- **CG2-13** approval is required for waterfall runs;
- **CG2-14** waterfall runs require idempotency;
- **CG2-15** snapshots preserve policy and source provenance;
- **CG2-16** stale writes are serialized by household lock;
- **CG2-17** economic designation is distinct from physical cash;
- **CG2-18** no manual override is exposed;
- **CG2-19** exact-cent math is used;
- **CG2-20** reserve priority precedes opportunity and investment recommendations;
- **CG2-21** legacy Safe-to-Deploy remains available;
- **CG2-22** v2 is additive to Treasury;
- **CG2-23** failures produce explicit readiness status;
- **CG2-24** reconciliation failures are visible;
- **CG2-25** protected bucket provenance is returned;
- **CG2-26** household capital surplus remains separate;
- **CG2-27** audit evidence is written for recommendations;
- **CG2-28** idempotent replay returns the original run;
- **CG2-29** no route performs money movement;
- **CG2-30** generated API artifacts and database declarations are fresh.

This document is evidence-indexed by the command output and should only be marked PASS after the isolated command completes successfully.