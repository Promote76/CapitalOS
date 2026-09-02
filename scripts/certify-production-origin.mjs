const origin = process.env.CAPITAL_OS_CERTIFICATION_ORIGIN?.replace(/\/+$/, "");

if (!origin) {
  console.error("BLOCKED: set CAPITAL_OS_CERTIFICATION_ORIGIN to the published application origin.");
  process.exit(2);
}

async function probe(name, headers = {}) {
  const response = await fetch(`${origin}/api/auth/onboard`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ name: "origin certification probe", timezone: "America/Chicago" }),
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return { name, status: response.status, code: body.code ?? null };
}

const probes = [
  await probe("missing-origin"),
  await probe("malformed-origin", { Origin: "not-a-url" }),
  await probe("cross-site-origin", {
    Origin: "https://evil.example",
    "Sec-Fetch-Site": "cross-site",
  }),
  await probe("allowed-origin", {
    Origin: origin,
    "Sec-Fetch-Site": "same-origin",
  }),
  await probe("allowed-origin-with-credential", {
    Origin: origin,
    Cookie: "__session=invalid-certification-probe",
    "Sec-Fetch-Site": "same-origin",
  }),
];

const expected = new Map([
  ["missing-origin", { status: 403, code: "ORIGIN_NOT_ALLOWED" }],
  ["malformed-origin", { status: 403, code: "ORIGIN_NOT_ALLOWED" }],
  ["cross-site-origin", { status: 403, code: "CSRF_BLOCKED" }],
  ["allowed-origin", { status: 401, code: "AUTHENTICATION_REQUIRED" }],
  ["allowed-origin-with-credential", { status: 401, code: "AUTHENTICATION_REQUIRED" }],
]);

const failures = probes.filter((probeResult) => {
  const target = expected.get(probeResult.name);
  return !target || target.status !== probeResult.status || target.code !== probeResult.code;
});

for (const probeResult of probes) {
  console.log(`${probeResult.name} | ${probeResult.status} | ${probeResult.code ?? "NO_CODE"}`);
}

if (failures.length) {
  console.error(`PRODUCTION ORIGIN: FAIL (${failures.length} probe(s))`);
  process.exit(1);
}

console.log(`PRODUCTION ORIGIN: PASS (${probes.length} probes)`);