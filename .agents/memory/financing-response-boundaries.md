---
name: Financing response boundaries
description: API response shaping for advisory financing data must preserve safe semantics across database and generated schemas.
---

Advisory financing endpoints should normalize database date values to the generated API's string shape and explicitly expose that manual credit inputs are not approval evidence. Loan proceeds remain a cash-plus-liability model, never income.

**Why:** Database date columns and generated OpenAPI schemas can disagree at runtime, while a raw credit profile can be misread as an approval signal if the boundary does not carry the safety meaning explicitly.

**How to apply:** When extending the financing workspace, shape response objects before generated-schema parsing; keep provider/execution flags disabled and keep household, business, protected, and planning scopes distinct.