# Capital OS role certification matrix

**Date:** 2026-09-02  
**Decision:** Partially certified; representative preflight probes exist, but the latest workspace execution skipped them because no dedicated certification database URL was configured.

| Action | Owner | Partner | Advisor | Viewer | Current HTTP evidence |
|---|---:|---:|---:|---:|---|
| View household finance | Allow | Allow | Restricted/advisory | Allow | Scoped GET preflight only |
| Edit budget | Allow | Allow | Deny | Deny | OPEN |
| Create contribution | Allow | Allow | Deny | Deny | Prior isolated fixture passed owner/partner allow and advisor/viewer denial; grant/revoke preflight added but not executed |
| Create transfer | Allow | Allow | Deny | Deny | Owner concurrency path and transfer replay pass; partner/advisor/viewer transfer-action execution remains OPEN |
| Submit capital request | Allow | Allow | Deny | Deny | OPEN |
| Approve capital request | Allow | Deny | Deny | Deny | OPEN |
| Change Treasury policy | Allow with recent auth | Deny | Deny | Deny | OPEN |
| Manage business | Allow | Allow | Deny | Deny | OPEN |
| Edit property | Allow | Allow | Deny | Deny | OPEN |
| Promote strategy | Allow with evidence | Deny | Review only | Deny | OPEN |
| Review strategy | Allow | Deny | Review | Deny | OPEN |
| View accounting | Allow | Allow | Restricted | Allow | OPEN |
| Export where implemented | No durable export route | No durable export route | No durable export route | No durable export route | Persistence matrix documents current state |
| Manage household/privacy | Allow with recent auth | Deny | Deny | Deny | OPEN |
| Arm or review Micro-Live | Allow with recent auth and gates | Deny | Review only | Deny | OPEN; real transmission remains disabled |

## Permission precedence

The server resolves the active membership and uses its stored permission list when present. If the stored list is empty, it falls back to the centralized role permission set. Step-up authentication is an additional requirement and does not create authorization. A viewer with fresh authentication remains denied.

The expanded database-backed HTTP preflight covers Owner and Partner contribution allowance, Advisor and Viewer denial, a stored Viewer contribution grant and revocation, active-membership revocation/restoration, role-header and body tampering, two explicit household selections for a multi-household member, and persisted audit attribution for selected Owner, Partner, Advisor, and explicitly granted Viewer actions. It also verifies denied tampering creates no misleading actor audit row.

There is no public membership-administration or persistent household-selection API. The preflight verifies those routes return `404`; grant/revoke and membership transitions are applied directly to the isolated fixture database before the next authenticated HTTP request. Real Clerk sessions still select the earliest active membership, while the certification-only database context accepts an explicitly verified household header. The authenticated Clerk browser gate remains the production proof for that path. P0-06 and P0-08 remain open until every documented authorization domain and permitted representative action has executed with persisted actor/no-audit assertions.
