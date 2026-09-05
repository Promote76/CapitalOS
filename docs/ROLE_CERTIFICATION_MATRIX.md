# Capital OS role certification matrix

**Date:** 2026-09-05
**Decision:** HTTP role/effective-permission and actor-attribution preflight certified on the disposable PostgreSQL target; authenticated browser lifecycle remains a separate open P0-05 gate.

| Action | Owner | Partner | Advisor | Viewer | Current HTTP evidence |
|---|---:|---:|---:|---:|---|
| View household finance | Allow | Allow | Restricted/advisory | Allow | Isolated scoped-read preflight |
| Edit budget | Allow | Allow | Deny | Deny | Isolated role/effective-permission preflight |
| Create contribution | Allow | Allow | Deny | Deny | Isolated fixture passed owner/partner allow, advisor/viewer denial, permission grant/revoke, and tampering cases |
| Create transfer | Allow | Allow | Deny | Deny | Owner concurrency/replay and centralized role/effective-permission denial paths pass |
| Submit capital request | Allow | Allow | Deny | Deny | Isolated role/effective-permission preflight |
| Approve capital request | Allow | Deny | Deny | Deny | Isolated role/effective-permission preflight |
| Change Treasury policy | Allow with recent auth | Deny | Deny | Deny | Isolated role/effective-permission preflight; browser step-up remains separate |
| Manage business | Allow | Allow | Deny | Deny | Isolated role/effective-permission preflight |
| Edit property | Allow | Allow | Deny | Deny | Isolated role/effective-permission preflight |
| Promote strategy | Allow with evidence | Deny | Review only | Deny | Isolated role/effective-permission preflight |
| Review strategy | Allow | Deny | Review | Deny | Isolated role/effective-permission preflight |
| View accounting | Allow | Allow | Restricted | Allow | Isolated scoped-read preflight |
| Export where implemented | No durable export route | No durable export route | No durable export route | No durable export route | Persistence matrix documents current state |
| Manage household/privacy | Allow with recent auth | Deny | Deny | Deny | Isolated role/effective-permission preflight |
| Arm or review Micro-Live | Allow with recent auth and gates | Deny | Review only | Deny | Isolated role/effective-permission preflight; real transmission remains disabled |

## Permission precedence

The server resolves the active membership and uses its stored permission list when present. If the stored list is empty, it falls back to the centralized role permission set. Step-up authentication is an additional requirement and does not create authorization. A viewer with fresh authentication remains denied.

The expanded database-backed HTTP preflight covers Owner and Partner contribution allowance, Advisor and Viewer denial, a stored Viewer contribution grant and revocation, active-membership revocation/restoration, role-header and body tampering, two explicit household selections for a multi-household member, and persisted audit attribution for selected Owner, Partner, Advisor, and explicitly granted Viewer actions. It also verifies denied tampering creates no misleading actor audit row. The disposable target execution passed with zero failures on 2026-09-05. Captured output is indexed by `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-05.md`.

There is no public membership-administration or persistent household-selection API. The preflight verifies those routes return `404`; grant/revoke and membership transitions are applied directly to the isolated fixture database before the next authenticated HTTP request. Real Clerk sessions still select the earliest active membership, while the certification-only database context accepts an explicitly verified household header. P0-06 and P0-08 are certified for this documented HTTP matrix; the authenticated Clerk browser gate remains the production proof for the UI lifecycle and is tracked separately as P0-05.
