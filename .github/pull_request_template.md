## Capital OS change

### Scope
Describe the smallest intended behavior change.

### Safety review
- [ ] Household/tenant scope reviewed
- [ ] Protected household/property capital boundary preserved
- [ ] No unintended brokerage execution or money movement
- [ ] Exact-cents / accounting behavior reviewed if financial math changed
- [ ] API/OpenAPI/generated artifacts updated together when contracts changed
- [ ] Audit/idempotency behavior reviewed when durable writes changed

### Verification
- [ ] `pnpm run typecheck`
- [ ] `pnpm run check:generated-finance-artifacts`
- [ ] API contract check
- [ ] Relevant focused tests/certification
- [ ] Capital OS CI is green

### Evidence
Summarize test results and any remaining UNKNOWN/BLOCKED gates.
