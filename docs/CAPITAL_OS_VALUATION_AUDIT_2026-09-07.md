# Capital OS valuation audit

**Valuation date:** 2026-09-07  
**Perspective:** Family-office operator evaluating a fintech operating system for a hypothetical $100 million AUM platform  
**Scope:** Current repository and certification evidence, not a financial-statement audit or a brokered valuation  
**Overall confidence:** Moderate on product scope and control architecture; low on market value because commercial evidence was not supplied

## Executive conclusion

Capital OS is a substantial, unusually safety-conscious family-capital operating system. It is not a simple dashboard or prototype: the current workspace contains 7 frontend pages, 24 API route modules, 36 domain modules, 18 service modules, 15 database schema modules, 44 documentation files, and approximately 46,218 TypeScript/TSX source lines across the product, API, and database libraries.

The product's strongest present value is **internal-use value to a sophisticated family office**, not a conventional SaaS revenue multiple. The system combines household finance, budgeting, Treasury controls, accounting, business separation, property underwriting, Family Office research, Shadow portfolios, operations, reliability, audit attribution, and disabled-by-design execution boundaries.

The principal commercial limitation is equally clear: the repository proves engineering scope and a meaningful body of isolated control evidence, but it does not prove paying customers, recurring revenue, transferable contracts, production support obligations, IP assignments, customer retention, or a public-production certification. Those missing facts prevent a high-confidence enterprise valuation.

### My provisional value opinion

| Question | Provisional conclusion | Confidence |
|---|---:|---|
| Current code/IP asset value in an arm's-length code or asset sale | **$100,000-$350,000 likely close range** | Low |
| Strategic value to a well-capitalized family-office, fintech, or wealth-tech buyer | **$300,000-$1,000,000**, if ownership and transferability are clean | Low-to-moderate |
| Reasonable current asking range before commercial diligence | **$350,000-$750,000** | Low |
| Likely cash-at-close range for the current state | **$150,000-$500,000** | Low |
| Operating SaaS/business valuation | **Unavailable until ARR, gross margin, retention, and contracts are verified** | High |
| Hypothetical $100M-AUM operator's internal-use value | **Approximately $300,000-$1,000,000 over a multi-year decision horizon**, scenario-based | Low |
| Amount to add to the user's personal net worth from this repository alone | **$0 supported today** | High |

The central as-is point estimate for the software asset is approximately **$300,000**, but it is a provisional market judgment, not an independently certified fair-market valuation. The range is deliberately below the likely cost to recreate the system because buyers do not reimburse engineering effort dollar-for-dollar when revenue, contracts, and transferability are unproven.

The $100 million AUM figure in this memo is an **operator evaluation lens only**. It is not attributed to the user, Capital OS, or the assistant.

## 1. Asset perimeter

The value-bearing perimeter should be separated into the following items:

| Component | Included in software-asset opinion? | Valuation treatment |
|---|---|---|
| Application source code, domain logic, UI, tests, schemas, and documentation | Yes | Primary asset value |
| Capital OS name, domain, trademarks, design system, and customer-facing materials | Unknown | Add only after ownership is documented |
| Generated API/Zod/client artifacts | Yes, as supporting artifacts | Must remain reproducible from the source contract |
| Household and client financial data | No by default | Privacy, consent, portability, and contractual rights must be proven |
| Grok/xAI provider access, model behavior, and provider credentials | No | Third-party dependency; no owned IP value assumed |
| Clerk, Neon/PostgreSQL, Slack, and Replit platform services | No | Transferable configuration may help operations, but vendor accounts are not owned assets |
| Shadow portfolios, recommendations, research, and tax-lien intelligence | Only as software workflow/IP | No investment-performance value without observed, independently attributable outcomes |
| Hypothetical $100M family-office AUM | No | Managed client assets are not Capital OS revenue or enterprise value |
| User's personal balance sheet | Not available | Must be supplied separately for a net-worth conclusion |

## 2. As-is product and control inventory

### Product capability

The current route and module inventory shows a broad operating system:

- Household identity, membership, role and effective-permission boundaries
- Dashboard, accounts, transactions, contributions, transfers, goals, budgets, cash flow, bills, income, and finance snapshots
- Treasury policies, protected capital, capital requests, approvals, allocation impact, and Safe-to-Deploy controls
- Accounting overview, reconciliation status, and separation of planning, Treasury, business, property, and household net worth
- Business entities, revenue, expenses, reserves, owner distributions, and the household/business bridge
- Property candidates, buy boxes, underwriting, financing, stress testing, documents, and acquisition-state boundaries
- Family Office provider state, research, proposals, Shadow portfolios and intents, outcomes, reports, workforce, Florida tax-lien intelligence, and bounded Grok refresh history
- Operations tasks, approvals, alerts, automations, safe-operation jobs, retries, dead-letter state, guided runs, decision journals, handoff history, and observability
- Strategy Lab research and rehearsal, with capital inaccessible to the research workflow
- Micro-Live rehearsal and eligibility controls, with real venue transmission disabled
- Read-only Schwab adapter boundary, with no order-placement method and fail-closed provider behavior

### Safety and financial integrity

Observed implementation and certification evidence supports the following controls:

- Authoritative monetary values use PostgreSQL `numeric(18,2)` and integer cents in decision logic.
- Household scoping, role checks, mass-assignment rejection, malformed identifier handling, and actor attribution have isolated HTTP/database evidence.
- Tested contribution, transfer, capital-request, and business-distribution paths use idempotency and transactional boundaries.
- Business operating cash remains separate from household deployable capital until a human-reviewed bridge.
- Planning, Treasury, business, property, and household accounting scopes are not silently combined.
- AI research is structured, schema-constrained, redacted, advisory-only, and prohibited from moving money, changing protections, enabling trading, changing credentials, or submitting legal/chain transactions.
- Micro-Live and broker pathways remain disabled or read-only by design; no banking, ACH, live brokerage, blockchain, external-investor-capital, or autonomous execution capability was enabled.
- Audit rows and operational failures have explicit persistence and retention boundaries, with named reliability delivery evidence recorded separately.

### Evidence strength

The release documents classify Capital OS as **IN-HOUSE ONLY — READY FOR CONTROLLED INTERNAL USE**, not public production. The documented P0 evidence is meaningful, but the remaining limitations matter to a buyer:

- Provider-supported Clerk reverification has implementation and historical evidence, but the latest protected transaction-review retry still needs fresh published browser certification.
- Managed production backup/restore and PITR remain open; disposable migration evidence is not a substitute.
- Durable scheduler/worker deployment and some restart evidence remain operational gates.
- Secret vault rotation, access audit, bundle/log/error/audit/AI-context secret review, and least-privilege evidence remain open.
- Broader financial invariants, rollback/failure injection, business equity, accounting completeness, and persistence truth across all critical writes remain partial.
- Public production identity/session certification is not complete.
- The current route inventory is 175 route/method pairs, while the evidence documents still contain 174-count markers; the contract check correctly fails until the certification evidence is refreshed.

### Verification performed for this memo

The generated workspace declarations were rebuilt before this memo because the recent Daily Ops/provenance merges had left `lib/*/dist` declarations behind the source. After regeneration:

- Capital OS frontend typecheck: **PASS**
- API server typecheck: **PASS**
- API server production build: **PASS**
- Generated finance artifacts freshness: **PASS**
- API/domain/integration test command: **133 passed, 0 failed, 34 skipped**
- Capital OS and API workflows: **running**
- API contract check: **OPEN**, because tenant evidence documents 174 route/method pairs while the authoritative inventory contains 175

This distinction is important: the generated declaration problem was repaired; the remaining contract failure is certification-document freshness, not a current TypeScript typecheck failure.

## 3. Risk and transferability assessment

| Area | Current assessment | Buyer implication |
|---|---|---|
| Technical scope | Strong and broad | Positive strategic value; meaningful diligence required |
| Financial safety architecture | Strong for controlled internal scope | Differentiator for family-office buyers |
| Tenant isolation and authorization | Strong isolated evidence, public release still separate | Positive, but buyer will require current-surface replay artifacts |
| Revenue and customers | Not evidenced in repository | Prevents ARR or customer-concentration valuation |
| IP ownership | Not evidenced | Potential deal blocker until assignments and work-for-hire records are complete |
| Third-party dependence | High: Clerk, Neon/PostgreSQL, Replit, Slack, xAI/Grok | Buyer needs account transfer, pricing, data-processing, and exit plans |
| Production readiness | Internal-only; public certification not complete | Requires a material discount or earn-out |
| Generated artifact discipline | Reproducible, but stale declarations recently occurred | Add a release gate that regenerates and typechecks from a clean workspace |
| Operations/support | Rich internal controls; durable external support model not evidenced | Key-person and support-cost discount |
| Data rights | Household financial data is safety-sensitive | Consent, retention, export, deletion, and data-processing diligence required |
| Defensibility | Workflow integration and safety model are valuable; source code alone is replicable | Strategic workflow fit matters more than code volume |
| Compliance posture | Advisory/non-executing boundaries help; formal compliance program not evidenced | Do not market as regulated financial advice or custody infrastructure without counsel |

## 4. Valuation methodology

### A. Cost-to-recreate

The system's 46,218 TypeScript/TSX lines, 114 database tables reported by the generator, broad domain surface, tests, generated contracts, and certification harness imply a meaningful rebuild effort. A reasonable directional estimate is **5-10 loaded engineering person-years**, or approximately **$800,000-$2,400,000** at $160,000-$240,000 per loaded person-year.

That is a replacement-cost indicator, not a sale price. It does not include commercial discovery, product management, security review, provider onboarding, migration, or the buyer's opportunity cost. It also does not prove that every line is unique or commercially defensible. The current market usually discounts replacement cost sharply when the asset has no verified revenue or transferable customer base.

### B. Market and strategic comparison

Current private SaaS references commonly describe approximately **2x-7x ARR** as a broad 2026 range, with the multiple determined by scale, growth, retention, margin, and revenue quality. SaaS Capital's 2025 analysis also cautions that public SaaS multiples are only directional and that private multiples are lower; it reported a 6.7x public index level in June 2025 while describing the market as selective.

Those revenue multiples do not apply to Capital OS today because no ARR, revenue, retention, or customer contracts were supplied or evidenced. The relevant market comparison is therefore an asset sale or strategic internal-use transaction, not a SaaS revenue multiple.

### C. Hypothetical $100M-AUM operator economics

For a family-office operator managing approximately $100 million AUM, Capital OS could have internal-use value through:

- Reducing fragmented operating and review work
- Improving evidence and auditability around household decisions
- Reducing avoidable errors in transfers, allocations, approvals, and reconciliation
- Giving a small team a shared operating rhythm without enabling unsafe automation
- Preserving a human-controlled advisory boundary while improving research throughput

Illustrative internal-use sensitivity, not observed savings:

| Annual economic benefit | 3-year undiscounted benefit | Interpretation |
|---:|---:|---|
| $100,000 | $300,000 | Conservative workflow consolidation |
| $200,000 | $600,000 | One meaningful operations capacity improvement |
| $300,000 | $900,000 | Multiple workflow and control improvements |
| $400,000 | $1,200,000 | Strong adoption plus avoided operating/vendor cost |

After implementation, migration, support, security, and failure-risk discounts, a rational strategic buyer might support a **$300,000-$1,000,000** internal-use value range. The $100 million AUM is only a scale context for willingness to pay; it is not multiplied into Capital OS value.

## 5. Sale-price scenarios

### Scenario 1 — Code and IP asset sale

**Expected close:** $100,000-$350,000  
**Reasonable asking range:** $350,000-$750,000  
**Buyer:** Another founder, small fintech, family-office technology vendor, or engineering-led acquirer  
**Primary conditions:** Clean IP assignment, repository transfer, reproducible build, documentation, and a short transition period  
**Main discount:** No customers or ARR evidenced; current route-evidence freshness failure; platform/provider dependencies

This is the most realistic immediate transaction category if the buyer is purchasing code and know-how rather than an operating company.

### Scenario 2 — Strategic family-office or wealth-tech acquisition

**Indicative value:** $300,000-$1,000,000  
**Buyer:** A family office, outsourced CIO, wealth-tech platform, or fintech with an existing distribution channel  
**Primary conditions:** Demonstrable internal adoption, clean ownership, buyer-specific workflow fit, and a credible support/roadmap handoff  
**Structure:** More likely to include a cash component plus transition, holdback, or milestone payments than a clean all-cash code purchase

This is where the product's safety boundaries, accounting separation, operational evidence, and family-office workflow design matter most. A strategic buyer can pay more than a code buyer because it may capture operating value that a generic acquirer cannot.

### Scenario 3 — Operating SaaS/business valuation

**Value:** **Unavailable from current evidence**  
**Method:** Verify ARR, gross margin, churn, net revenue retention, customer concentration, CAC/payback, owner dependence, and contracted renewal rights; then apply an appropriate private-company multiple or SDE/EBITDA method.

Using a broad 2x-7x ARR benchmark without ARR would create a false precision. If verified ARR later exists, the correct formula is:

`enterprise value = normalized recurring revenue × evidence-supported multiple`

Then subtract debt, transaction liabilities, working-capital adjustments, taxes, and any non-transferable or contingent obligations to reach equity value.

## 6. Personal financial-statement treatment

This memo does not have the user's ownership percentage, legal entity, basis, debt, liquidity, or personal balance sheet. Therefore it cannot calculate the user's personal net worth.

The appropriate treatment is:

1. **If the user does not own Capital OS equity:** add $0 to personal net worth.
2. **If the user owns an internally developed but unsold product:** do not add the speculative $300,000 point estimate as if it were cash. A personal statement may disclose the ownership interest separately, but the recognized amount depends on the applicable accounting basis and professional advice.
3. **If the user paid documented costs for an entity or purchased equity:** use documented basis and ownership records, subject to the user's accounting framework; do not silently substitute a market estimate.
4. **If an independent valuation or arm's-length offer exists:** a supported fair-value view may be shown as a private business interest, discounted for illiquidity, taxes, debt, transfer restrictions, and sale costs.
5. **If the product is sold:** use expected net proceeds, not headline enterprise value, after debt, taxes, transaction costs, escrow/holdback, and earn-out probability.
6. **The hypothetical $100 million AUM operator's client assets do not enter the user's personal net worth or Capital OS enterprise value** unless the operator personally owns those assets and the legal/economic rights are documented.

### Practical net-worth answer today

**Supported addition to the user's personal net worth from Capital OS: $0.**  
**Possible private-business-interest memo range if the user proves ownership and elects a supportable fair-value presentation: $100,000-$350,000 for the current asset-sale case.**  
**This memo range is not a CPA-approved carrying value and should not be used as a tax filing figure.**

## 7. Evidence required before quoting a higher value

### Ownership and transfer

- Entity formation and cap table
- Founder, employee, and contractor IP assignments
- Work-for-hire and open-source license inventory
- Domain, brand, design, and content ownership
- Third-party data and model license rights
- Transferability of Clerk, database, Slack, Replit, and xAI configurations

### Commercial performance

- Monthly and annual recurring revenue
- Paid customer list and contract terms
- Gross margin, churn, retention, expansion, and concentration
- Pipeline, pilots, renewal history, and referenceable users
- Customer acquisition cost, payback, support burden, and implementation time
- Prior offers, bids, comparable transactions, or signed LOIs

### Operating and risk

- Actual hosting/provider spend and engineering/support payroll
- Security assessment, incident history, privacy notices, DPAs, and retention policy
- Production backup/restore evidence and recovery objectives
- Current route/certification replay after the 175-route update
- Clerk reverification browser evidence for the latest published flow
- Secret rotation/access-audit evidence and deployment runbook
- Known liabilities, litigation, tax exposure, and contractual restrictions

## 8. Value-creation and sale-readiness roadmap

### Next 30 days

- Refresh the tenant isolation route evidence from 174 to the current 175-route inventory and rerun the contract check.
- Add a clean-workspace generation/typecheck gate so stale `lib/*/dist` declarations cannot recur.
- Complete the latest authenticated Clerk reverification browser evidence.
- Assemble the IP, provider, architecture, and operating-cost data room.

### Days 31-60

- Put the product in controlled use with one clearly defined family-office operating team.
- Measure hours saved, review-cycle time, error prevention, adoption, and support burden.
- Obtain at least one independent security/privacy review and document provider exit plans.
- Convert the strongest internal workflow into a buyer demo with evidence, not claims.

### Days 61-90

- Secure paid design-partner or pilot agreements with explicit ownership and data terms.
- Track recurring revenue, retention, and implementation economics.
- Produce a buyer-ready diligence package and obtain at least two non-binding strategic indications.
- Revalue using observed customer economics rather than replacement-cost heuristics.

## 9. Sources and limitations

Market references consulted:

- SaaS Capital, “SaaS Valuation Multiples: Understanding the New Normal,” 2025: https://www.saas-capital.com/blog-posts/saas-valuation-multiples-understanding-the-new-normal
- SaaS Capital, “How to Value a SaaS Company 2026”: https://www.saas-capital.com/research/whats-your-saas-company-worth/
- FE International, “SaaS Valuation Multiples in 2026: Private Deal Benchmarks by ARR, Growth, and Retention”: https://www.feinternational.com/blog/saas-valuation-multiples

These sources are directional market references, not appraisals of Capital OS. The valuation ranges above are provisional because no financial statements, customer contracts, ownership records, or transaction offers were provided. A credentialed business valuation professional, CPA, and attorney should review any number used for a sale process, tax filing, lender package, or audited personal financial statement.