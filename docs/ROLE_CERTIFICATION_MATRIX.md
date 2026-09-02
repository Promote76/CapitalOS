# Capital OS role certification matrix

**Date:** 2026-09-02  
**Decision:** Partially certified; the rows below separate intended authorization from executed HTTP evidence.

| Action | Owner | Partner | Advisor | Viewer | Current HTTP evidence |
|---|---:|---:|---:|---:|---|
| View household finance | Allow | Allow | Restricted/advisory | Allow | OPEN |
| Edit budget | Allow | Allow | Deny | Deny | OPEN |
| Create contribution | Allow | Allow | Deny | Deny | Isolated Neon PostgreSQL fixture passed owner/partner allow and advisor/viewer denial cases |
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

The server resolves the active membership and uses its stored permission list when present. If the stored list is empty, it falls back to the centralized role permission set. Step-up authentication is an additional requirement and does not create authorization. A viewer with fresh authentication remains denied. The isolated PostgreSQL fixture provisions every documented role in both households and passes the implemented contribution-role paths; full action and grant/revocation execution remains open.

Membership selection currently uses the earliest active membership. Production candidate certification must either enforce one active household per user or add an explicit server-verified household selection context before multi-household users are enabled.
