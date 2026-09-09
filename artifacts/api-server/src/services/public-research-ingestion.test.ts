import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ingestPublicResearchUrl, type PublicResearchDependencies } from "./public-research-ingestion";

const html = `<html><head><title>Acme research</title></head><body>${"Acme Corporation (ACME) publishes durable public results. ".repeat(8)}</body></html>`;
function deps(page = html, robots = "User-agent: CapitalOS-ResearchIngestion/1.0\nAllow: /") : PublicResearchDependencies {
  return {
    resolve: async (host) => [{ address: host === "ipv6.example" ? "2001:4860:4860::8888" : "93.184.216.34", family: host === "ipv6.example" ? 6 : 4 }],
    request: async (url) => new Response(url.endsWith("/robots.txt") ? robots : page, {
      status: 200, headers: { "content-type": url.endsWith("/robots.txt") ? "text/plain" : "text/html" },
    }),
    now: () => new Date("2025-01-01T00:00:00.000Z"),
  };
}

describe("public research ingestion", () => {
  it("rejects non-HTTPS, credentials, unsafe ports and local hosts", async () => {
    for (const url of ["http://example.com", "https://user:pass@example.com", "https://example.com:444", "https://localhost"]) {
      assert.equal((await ingestPublicResearchUrl({ url }, deps())).status, "blocked");
    }
  });
  it("rejects private and reserved DNS addresses including IPv6", async () => {
    for (const address of ["10.0.0.1", "192.168.1.1", "127.0.0.1", "169.254.1.1", "198.19.0.1", "224.0.0.1", "::1", "fc00::1", "100::1", "2001:2::1", "2001:db8::1", "64:ff9b:1::1", "4000::1", "::ffff:127.0.0.1"]) {
      const d = deps(); d.resolve = async () => [{ address, family: address.includes(":") ? 6 : 4 }];
      assert.equal((await ingestPublicResearchUrl({ url: "https://example.com" }, d)).status, "blocked");
    }
  });
  it("rejects malformed, family-mismatched, and mixed DNS answers", async () => {
    for (const answers of [
      [{ address: "not-an-ip", family: 4 }],
      [{ address: "93.184.216.34", family: 6 }],
      [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }],
    ]) {
      const d = deps(); d.resolve = async () => answers;
      assert.equal((await ingestPublicResearchUrl({ url: "https://example.com" }, d)).status, "blocked");
    }
  });
  it("supports IPv6 and returns pinned successful provenance", async () => {
    const result = await ingestPublicResearchUrl({ url: "https://ipv6.example", ticker: "ACME" }, deps());
    assert.equal(result.status, "extracted"); assert.equal(result.provenance, "server_fetched_public");
    assert.equal(result.sourceRetrieval?.finalUrl, "https://ipv6.example/");
  });
  it("fails closed on robots deny, empty robots, and robots failure", async () => {
    assert.equal((await ingestPublicResearchUrl({ url: "https://example.com" }, deps(html, "User-agent: *\nDisallow: /"))).status, "robots_denied");
    assert.equal((await ingestPublicResearchUrl({ url: "https://example.com" }, deps(html, ""))).status, "robots_denied");
    const d = deps(); d.request = async () => new Response("", { status: 503 });
    assert.equal((await ingestPublicResearchUrl({ url: "https://example.com" }, d)).status, "robots_denied");
  });
  it("honors exact bot group and longest allow override", async () => {
    const robots = "User-agent: *\nDisallow: /\n\nUser-agent: CapitalOS-ResearchIngestion/1.0\nDisallow: /\nAllow: /public";
    assert.equal((await ingestPublicResearchUrl({ url: "https://example.com/public" }, deps(html, robots))).status, "extracted");
  });
  it("supports robots wildcards, terminal anchors and empty disallow", async () => {
    assert.equal((await ingestPublicResearchUrl({ url: "https://example.com/article" }, deps(html, "User-agent: *\nDisallow: /*"))).status, "robots_denied");
    assert.equal((await ingestPublicResearchUrl({ url: "https://example.com/article" }, deps(html, "User-agent: *\nDisallow: /article$\nAllow: /article"))).status, "extracted");
    assert.equal((await ingestPublicResearchUrl({ url: "https://example.com/article/more" }, deps(html, "User-agent: *\nDisallow: /article$\nDisallow:"))).status, "extracted");
  });
  it("matches the crawler product token instead of the versioned HTTP UA", async () => {
    const robots = "User-agent: *\nAllow: /\n\nUser-agent: CapitalOS-ResearchIngestion\nDisallow: /";
    assert.equal((await ingestPublicResearchUrl({ url: "https://example.com/article" }, deps(html, robots))).status, "robots_denied");
  });
  it("bounds adversarial wildcard matching work", async () => {
    const adversarial = `User-agent: *\nDisallow: /${"*a".repeat(20)}$`;
    const started = Date.now();
    const status = (await ingestPublicResearchUrl({ url: `https://example.com/${"a".repeat(2000)}` }, deps(html, adversarial))).status;
    assert.ok(status === "robots_denied" || status === "extracted");
    assert.ok(Date.now() - started < 1000);
  });
  it("blocks unsupported, oversized and access-controlled pages", async () => {
    const d = deps(); d.request = async (url) => new Response(url.endsWith("/robots.txt") ? "User-agent: *\nAllow: /" : "x".repeat(200), { headers: { "content-type": "application/pdf" } });
    assert.equal((await ingestPublicResearchUrl({ url: "https://example.com" }, d)).status, "unsupported");
    assert.equal((await ingestPublicResearchUrl({ url: "https://example.com" }, deps("<html>login required captcha</html>"))).status, "login_required");
    assert.equal((await ingestPublicResearchUrl({ url: "https://example.com" }, deps("<meta name=\"robots\" content=\"noindex\"><body>long public text ".repeat(30)))).status, "blocked");
  });
  it("detects paywall and Simply Wall St remains safe", async () => {
    assert.equal((await ingestPublicResearchUrl({ url: "https://example.com" }, deps("<body>Subscribe to continue paywall</body>"))).status, "paywall");
    const result = await ingestPublicResearchUrl({ url: "https://simplywall.st/stocks/acme" }, deps("<body>Subscribe to continue</body>"));
    assert.equal(result.status, "paywall");
  });
  it("detects access controls after the extraction preview boundary", async () => {
    const late = `<body>${"Public company analysis and financial discussion. ".repeat(900)}<footer>Subscribe to continue paywall</footer></body>`;
    assert.equal((await ingestPublicResearchUrl({ url: "https://example.com" }, deps(late))).status, "paywall");
  });
  it("extracts bounded text, ticker, final URL and retrieval timestamp", async () => {
    const result = await ingestPublicResearchUrl({ url: "https://example.com", ticker: "ACME" }, deps());
    assert.equal(result.finalUrl, "https://example.com/"); assert.equal(result.retrievedAt, "2025-01-01T00:00:00.000Z");
    assert.equal(result.ticker, "ACME"); assert.ok(result.facts.length > 0);
  });
});