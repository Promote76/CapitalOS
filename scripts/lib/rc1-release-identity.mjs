import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const includedPrefixes = [
  "artifacts/api-server/.replit-artifact/artifact.toml",
  "artifacts/api-server/package.json",
  "artifacts/api-server/src/",
  "docs/PRODUCTION_CANDIDATE_EVIDENCE_INDEX.md",
  "docs/TENANT_ISOLATION_ROUTE_MATRIX.md",
  "lib/api-client-react/",
  "lib/api-spec/",
  "lib/api-zod/",
  "lib/db/migrations/",
  "package.json",
  "pnpm-lock.yaml",
  "scripts/check-api-artifact-config.mjs",
  "scripts/check-api-contract.mjs",
  "scripts/check-production-readiness-manifest.mjs",
  "scripts/certify-operations-recovery.mjs",
  "scripts/generate-production-readiness-manifest.mjs",
  "scripts/lib/rc1-release-identity.mjs",
  "scripts/post-merge.sh",
];

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

export function collectRc1ReleaseInputs(root) {
  const files = git(root, ["ls-files", "--cached", "--others", "--exclude-standard"])
    .split("\n")
    .filter(Boolean)
    .filter((file) =>
      includedPrefixes.some((prefix) =>
        prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix,
      ),
    )
    .filter((file) => !file.includes("/dist/"))
    .sort();
  if (files.length === 0) throw new Error("No RC1 release inputs were found.");
  return files;
}

export function computeRc1ReleaseIdentity(root) {
  const inputs = collectRc1ReleaseInputs(root);
  const hash = crypto.createHash("sha256");
  for (const file of inputs) {
    hash.update(file);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(root, file)));
    hash.update("\0");
  }
  return {
    baseCommit: git(root, ["rev-parse", "HEAD"]),
    sourceSha256: hash.digest("hex"),
    inputCount: inputs.length,
    inputs,
  };
}