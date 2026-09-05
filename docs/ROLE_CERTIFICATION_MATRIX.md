# Capital OS role certification matrix

**Date:** 2026-09-05
**Decision:** HTTP role/effective-permission and actor-attribution certification passed on the disposable PostgreSQL target; authenticated browser lifecycle remains a separate open P0-05 gate. See the [captured role-action HTTP evidence](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md).

| Action | Owner | Partner | Advisor | Viewer | Current HTTP evidence |
|---|---:|---:|---:|---:|---|
| [View household finance](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#view-household-finance) | Allow | Allow | Restricted/advisory | Allow | `GET /budget`: 200 for all roles; scoped/redacted read verified |
| [Edit budget](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#edit-budget) | Allow | Allow | Deny | Deny | `PUT /allocations`: 200, 200, 403, 403; persisted actor audit |
| [Create contribution](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#create-contribution) | Allow | Allow | Deny | Deny | `POST /contributions`: valid allow/deny, grant/revoke, tampering, and actor audit |
| [Create transfer](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#create-transfer) | Allow | Allow | Deny | Deny | `POST /transfers`: 201, 201, 403, 403; persisted actor audit |
| [Submit capital request](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#submit-capital-request) | Allow | Allow | Deny | Deny | `POST /treasury/requests`: 201, 201, 403, 403; persisted actor audit |
| [Approve capital request](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#approve-capital-request) | Allow | Deny | Deny | Deny | Decision route: Owner 200; other roles 403; persisted actor audit |
| [Change Treasury policy](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#change-treasuryprivacy-policy) | Allow with recent auth | Deny | Deny | Deny | Implemented policy mutation is `PATCH /household/privacy`; persisted state and actor audit |
| [Manage business](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#manage-business) | Allow | Allow | Deny | Deny | `POST /business/companies`: 201, 201, 403, 403; persisted actor audit |
| [Edit property](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#edit-property) | Allow | Allow | Deny | Deny | `POST /properties`: 201, 201, 403, 403; persisted actor audit |
| [Promote strategy](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#promote-strategy) | Allow with evidence | Deny | Review only | Deny | `POST /strategies/:strategyId/promote`: Owner 200; other roles 403 |
| [Review strategy](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#review-strategy) | Allow | Deny | Review | Deny | Graduation review route: Owner and Advisor 200; Partner and Viewer 403 |
| [View accounting](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#view-accounting) | Allow | Allow | Restricted | Allow | `GET /accounting`: 200 for all roles; scoped read verified |
| Export where implemented | No durable export route | No durable export route | No durable export route | No durable export route | [No durable route is implemented](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#membership-transitions-and-unsupported-capabilities) |
| [Manage household/privacy](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#change-treasuryprivacy-policy) | Allow with recent auth | Deny | Deny | Deny | `PATCH /household/privacy`: Owner 200; other roles 403; persisted actor audit |
| [Arm or review Micro-Live](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md#review-micro-live-venue) | Allow with recent auth and gates | Deny | Review only | Deny | Venue review route certified; arm remains gate-blocked and transmission disabled |

## Permission precedence

The server resolves the active membership and uses its stored permission list when present. If the stored list is empty, it falls back to the centralized role permission set. Step-up authentication is an additional requirement and does not create authorization. A viewer with fresh authentication remains denied.

The expanded database-backed HTTP preflight covers all route-level actions linked above, Owner/Partner contribution allowance, Advisor/Viewer denial, a stored Viewer contribution grant and revocation, active-membership revocation/restoration, role-header and body tampering, two explicit household selections for a multi-household member, and persisted audit attribution for every successful mutation in the route-action fixture. It also verifies denied tampering creates no misleading actor audit row. The disposable target execution passed with zero failures on 2026-09-05. Captured output is indexed by the [role-action evidence record](certification/ROLE_ACTION_HTTP_EVIDENCE_2026-09-05.md).

There is no public membership-administration or persistent household-selection API. The preflight verifies those routes return `404`; grant/revoke and membership transitions are applied directly to the isolated fixture database before the next authenticated HTTP request. Real Clerk sessions still select the earliest active membership, while the certification-only database context accepts an explicitly verified household header. P0-06 and P0-08 are certified for this documented HTTP matrix; the authenticated Clerk browser gate remains the production proof for the UI lifecycle and is tracked separately as P0-05.
