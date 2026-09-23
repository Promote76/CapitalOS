import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const agent = read("artifacts/api-server/src/services/portfolio-agent.ts");
const familyOfficeRoute = read("artifacts/api-server/src/routes/family-office.ts");
const inputType = read("lib/api-zod/src/generated/types/portfolioAgentInput.ts");
const responseType = read("lib/api-zod/src/generated/types/portfolioAgentResponse.ts");
const openapi = read("lib/api-spec/openapi.yaml");

const checks = [
  ["agent requires a snapshot id", /question:\s*string,\s*snapshotId:\s*string/.test(agent)],
  ["snapshot lookup is household scoped", /schwabObservationSnapshots\.householdId[\s\S]*actor\.householdId[\s\S]*schwabObservationSnapshots\.id[\s\S]*snapshotId/.test(agent)],
  ["route passes the requested snapshot id", /askGroundedPortfolioAgent\([^)]*body\.question,\s*body\.snapshotId\)/.test(familyOfficeRoute)],
  ["generated request requires snapshotId", /snapshotId:\s*string/.test(inputType)],
  ["response returns the snapshot id", /snapshotId:\s*string/.test(responseType)],
  ["agent is advisory only", /advisoryOnly:\s*true\s+as const/.test(agent) && /advisoryOnly:\s*true/.test(responseType)],
  ["agent is educational only", /educationalOnly:\s*true\s+as const/.test(agent) && /educationalOnly:\s*true/.test(responseType)],
  ["execution authority is disabled", /executionAuthorization:\s*false\s+as const/.test(agent) && /executionAuthorization:\s*false/.test(responseType)],
  ["money movement is disabled", /moneyMovementEnabled:\s*false\s+as const/.test(agent) && /moneyMovementEnabled:\s*false/.test(responseType)],
  ["trade and money-movement requests are blocked", /blockedRequest/.test(agent) && /place\|submit\|cancel\|replace\|execute\|automate\|buy\|sell\|purchase\|short/.test(agent) && /transfer\|withdraw/.test(agent)],
  ["observed facts and approved research are separated", /PORTFOLIO_OBSERVATION/.test(agent) && /APPROVED_RESEARCH/.test(agent) && /Keep APPROVED_RESEARCH separate from current holdings/.test(agent)],
  ["stale or unknown snapshots are disclosed", /STALE or UNKNOWN/.test(agent)],
  ["unresolved reconciliation is disclosed", /UNRESOLVED or CRITICAL_MISMATCH/.test(agent)],
  ["OpenAPI exposes the portfolio agent contract", /\/family-office\/portfolio-agent:/.test(openapi) && /snapshotId/.test(openapi)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) {
  process.stdout.write(`${ok ? "PASS" : "FAIL"} - ${name}\n`);
}
assert.equal(failed.length, 0, `Portfolio AI certification failed: ${failed.map(([name]) => name).join(", ")}`);
process.stdout.write(`PASS - Portfolio AI source certification (${checks.length}/${checks.length})\n`);
