# Role action HTTP certification evidence

**Execution date:** 2026-09-05  
**Command:** `pnpm run certify:household-privacy`  
**Target:** disposable local PostgreSQL cluster with the certification sentinel  
**Result:** **PASS — 7 tests passed, 0 failed**

The captured run is
[`household-privacy-2026-09-05T03-57-25Z.log`](household-privacy-runs/household-privacy-2026-09-05T03-57-25Z.log).
The shared application database was not used.

## Route-level role actions

Each row below is emitted by the `P0-06/P0-08-ROLE-ACTION-HTTP` JSON summary in
the captured run. Statuses are HTTP response statuses from the real Express
routes; denied calls were made with valid request shapes and active memberships.

| Action | Route | Owner | Partner | Advisor | Viewer | Persisted attribution |
|---|---|---:|---:|---:|---:|---|
| [View household finance](#view-household-finance) | `GET /budget` | 200 | 200 | 200 | 200 | Scoped/redacted read response |
| [Edit budget](#edit-budget) | `PUT /allocations` | 200 | 200 | 403 | 403 | `allocation_rule_updated` |
| [Create contribution](#create-contribution) | `POST /contributions` | 201 | 201 | 403 | 403 | `contribution_completed` |
| [Create transfer](#create-transfer) | `POST /transfers` | 201 | 201 | 403 | 403 | `transfer_completed` |
| [Submit capital request](#submit-capital-request) | `POST /treasury/requests` | 201 | 201 | 403 | 403 | `capital_request_submitted` |
| [Approve capital request](#approve-capital-request) | `POST /treasury/requests/:requestId/decision` | 200 | 403 | 403 | 403 | `capital_request_decided` |
| [Change Treasury/privacy policy](#change-treasuryprivacy-policy) | `PATCH /household/privacy` | 200 | 403 | 403 | 403 | `household_privacy_updated` |
| [Manage business](#manage-business) | `POST /business/companies` | 201 | 201 | 403 | 403 | `business_entity_created` |
| [Edit property](#edit-property) | `POST /properties` | 201 | 201 | 403 | 403 | `property_note_created` |
| [Promote strategy](#promote-strategy) | `POST /strategies/:strategyId/promote` | 200 | 403 | 403 | 403 | `strategy_stage_override` |
| [Review strategy](#review-strategy) | `POST /strategy-lab/strategies/:strategyId/graduation` | 200 | 403 | 200 | 403 | `strategy_graduation_*` |
| [View accounting](#view-accounting) | `GET /accounting` | 200 | 200 | 200 | 200 | Scoped read response |
| [Review Micro-Live venue](#review-micro-live-venue) | `POST /micro-live/venues/:venueId/reviews/security` | 201 | 403 | 201 | 403 | `micro_live_venue_security_reviewed` |

### View household finance

The fixture calls `GET /budget` as each role and verifies a successful,
household-scoped response. The existing Treasury read assertion also verifies
that Advisor output redacts protected balances.

### Edit budget

The fixture submits a valid allocation rule through `PUT /allocations` as
Owner and Partner, then verifies the persisted `allocation_rule_updated` actor
for each caller. Advisor and Viewer receive `403`.

### Create contribution

The adjacent P0-06 fixture submits valid contributions as Owner and Partner,
denies Advisor and Viewer, and checks contribution audit attribution. It also
checks a stored Viewer permission grant and revocation through the same route.

### Create transfer

The fixture transfers a valid cent amount between two household capital
accounts for Owner and Partner, verifies `transfer_completed` attribution, and
denies Advisor and Viewer.

### Submit capital request

The fixture creates valid, idempotent Treasury requests as Owner and Partner
and verifies `capital_request_submitted` attribution. Advisor and Viewer are
denied before any request is persisted.

### Approve capital request

The fixture creates an isolated request, denies Partner, Advisor, and Viewer,
then approves the full requested amount as Owner through the decision route. It
verifies the resulting `capital_request_decided` audit actor.

### Change Treasury/privacy policy

There is no separate durable Treasury-policy route. The implemented recent-auth
policy mutation is `PATCH /household/privacy`; Owner succeeds and the other
roles are denied. The fixture verifies the persisted settings and
`household_privacy_updated` actor.

### Manage business

Owner and Partner each create a valid business entity through the companies
route. The fixture verifies `business_entity_created` attribution and denies
Advisor and Viewer.

### Edit property

Owner and Partner each add a valid property research note through `POST
/properties`, which is the implemented property-edit route available to both
roles. The fixture verifies `property_note_created` attribution and denies
Advisor and Viewer.

### Promote strategy

Owner promotes a seeded strategy using the valid evidence-backed override
request and the fixture verifies `strategy_stage_override`. Partner, Advisor,
and Viewer are denied.

### Review strategy

The graduation evaluation route is the implemented strategy-review action.
Owner and Advisor may review it; Partner and Viewer are denied. Both successful
review audit events retain the caller, whether the evaluation is eligible or
denied by strategy evidence.

### View accounting

The fixture calls `GET /accounting` for all four roles and verifies a
successful, household-scoped response.

### Review Micro-Live venue

Owner and Advisor submit valid security-review references through the real
venue-review route and the fixture verifies each persisted
`micro_live_venue_security_reviewed` actor. Partner and Viewer are denied.
Micro-Live arming is not represented as a successful action because its
human-controlled gate remains intentionally blocked until all enablement
conditions pass; real transmission remains disabled.

## Membership transitions and unsupported capabilities

The adjacent P0-06 fixture applies a Viewer permission grant and revocation
directly to the isolated fixture database, then checks the resulting HTTP
contribution responses (`201` after grant and `403` after revoke). It also
checks inactive membership denial and active membership restoration through
`GET /household`, plus two explicit household selections. Public membership
administration and selection routes return `404`; there is no durable household
export route.
