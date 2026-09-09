import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import ipaddr from "ipaddr.js";

export const PUBLIC_RESEARCH_CRAWLER_TOKEN = "CapitalOS-ResearchIngestion";
export const PUBLIC_RESEARCH_USER_AGENT = `${PUBLIC_RESEARCH_CRAWLER_TOKEN}/1.0`;
export const PUBLIC_RESEARCH_MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const INGESTION_TIMEOUT_MS = 25_000;

export type PublicResearchStatus =
  | "validating" | "fetching" | "extracted" | "blocked" | "inaccessible"
  | "unsupported" | "login_required" | "paywall" | "robots_denied" | "ticker_required";

export type PublicResearchResult = {
  status: PublicResearchStatus;
  finalUrl: string | null;
  retrievedAt: string | null;
  title: string | null;
  text: string | null;
  facts: string[];
  ticker: string | null;
  company: string | null;
  freshness: "fresh" | "stale" | "unknown";
  provenance: "server_fetched_public" | "user_authorized_excerpt_required";
  limitation?: string;
  sourceRetrieval?: { finalUrl: string; retrievedAt: string; freshness: "fresh" | "stale" | "unknown"; provenance: "PUBLIC_WEB_RETRIEVAL" };
};

type Lookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type PinnedRequest = (url: string, init: RequestInit, addresses: Array<{ address: string; family: number }>) => Promise<Response>;
export type PublicResearchDependencies = { resolve?: Lookup; request?: PinnedRequest; now?: () => Date };

function unsafeAddress(address: string) {
  try {
    const parsed = ipaddr.parse(address.replace(/^\[|\]$/g, ""));
    if (parsed.kind() === "ipv6") {
      const ipv6 = parsed as ipaddr.IPv6;
      return ipv6.isIPv4MappedAddress() || parsed.range() !== "unicast" || (ipv6.parts[0] & 0xe000) !== 0x2000;
    }
    return parsed.range() !== "unicast";
  } catch { return true; }
}
function unsafeHost(host: string) {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") ||
    h.endsWith(".home.arpa") || h === "metadata.google.internal";
}
function safeUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
  if (unsafeHost(url.hostname)) return null;
  return url;
}
async function publicDestination(url: URL, resolve: Lookup) {
  const addresses = await resolve(url.hostname);
  return addresses.length > 0 && addresses.every((item) => {
    try { return !unsafeAddress(item.address) && ipaddr.parse(item.address).kind() === `ipv${item.family}`; } catch { return false; }
  }) ? addresses : null;
}
function pinnedRequest(url: string, init: RequestInit, addresses: Array<{ address: string; family: number }>) {
  return new Promise<Response>((resolve, reject) => {
    const target = new URL(url);
    const method = String(init.method ?? "GET");
    const req = httpsRequest({
      protocol: "https:", hostname: target.hostname, port: 443, path: `${target.pathname}${target.search}`,
      method, headers: init.headers as Record<string, string>, servername: target.hostname,
      timeout: REQUEST_TIMEOUT_MS,
      family: addresses[0].family,
      lookup: (_hostname, options, callback) => {
        const selected = addresses[0];
        if (typeof options === "object" && options.all) {
          (callback as (error: null, addresses: Array<{ address: string; family: 4 | 6 }>) => void)(null, [{ address: selected.address, family: selected.family as 4 | 6 }]);
        } else callback(null, selected.address, selected.family as 4 | 6);
      },
    }, (response) => {
      try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(response.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        const status = response.statusCode ?? 502;
        resolve(new Response([204, 205, 304].includes(status) ? null : response as unknown as any, { status, headers }));
      } catch (error) { response.destroy(); reject(error); }
    });
    const signal = init.signal;
    if (signal) {
      const abort = () => req.destroy(new Error("aborted"));
      if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    }
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}
async function readBounded(response: Response, maxBytes: number, signal?: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("inaccessible");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    if (signal?.aborted) { await reader.cancel(); throw new Error("timeout"); }
    const part = await reader.read(); if (part.done) break;
    size += part.value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error("oversize"); }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function beforeDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error("timeout");
  return Promise.race([work, new Promise<T>((_, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true }))]);
}
function result(status: PublicResearchStatus, limitation: string, now: () => Date): PublicResearchResult {
  return { status, finalUrl: null, retrievedAt: null, title: null, text: null, facts: [], ticker: null, company: null,
    freshness: "unknown", provenance: "user_authorized_excerpt_required", limitation };
}
function cleanHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}
function titleOf(html: string) {
  return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 180) || null;
}
function signal(text: string, re: RegExp) { return re.test(text); }

export async function ingestPublicResearchUrl(input: { url: string; ticker?: string }, deps: PublicResearchDependencies = {}): Promise<PublicResearchResult> {
  const resolve = deps.resolve ?? (async (host) => (await lookup(host, { all: true })).map((x) => ({ address: x.address, family: x.family })));
  const injected = deps.request;
  const now = deps.now ?? (() => new Date());
  const overallSignal = AbortSignal.timeout(INGESTION_TIMEOUT_MS);
  const resolveDeadline: Lookup = (host) => beforeDeadline(resolve(host), overallSignal);
  const initial = safeUrl(input.url);
  if (!initial) return result("blocked", "Only public HTTPS pages without credentials or unsafe ports are accepted.", now);
  try {
    const initialAddresses = await publicDestination(initial, resolveDeadline);
    if (!initialAddresses) return result("blocked", "The requested destination is not publicly reachable.", now);
    let current = initial;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const robots = new URL("/robots.txt", current);
      const robotsAddresses = await publicDestination(robots, resolveDeadline);
      if (!robotsAddresses) return result("robots_denied", "Robots policy could not be evaluated.", now);
      const robotsSignal = AbortSignal.any([overallSignal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
      const robotsResponse = injected
        ? await injected(robots.href, { method: "GET", redirect: "manual", signal: robotsSignal, headers: { "User-Agent": PUBLIC_RESEARCH_USER_AGENT } }, robotsAddresses)
        : await pinnedRequest(robots.href, { method: "GET", redirect: "manual", signal: robotsSignal, headers: { "User-Agent": PUBLIC_RESEARCH_USER_AGENT } }, robotsAddresses);
      if (!robotsResponse.ok || (robotsResponse.status >= 300 && robotsResponse.status < 400)) return result("robots_denied", "Robots policy could not be evaluated.", now);
      let robotsText: string;
      try { robotsText = await readBounded(robotsResponse, 50 * 1024, robotsSignal); }
      catch { return result("robots_denied", "Robots policy could not be evaluated.", now); }
      if (!robotsAllows(robotsText, current)) {
        return result("robots_denied", "The site does not permit this page to be retrieved.", now);
      }
      const pageAddresses = current.href === initial.href ? initialAddresses : await publicDestination(current, resolveDeadline);
      if (!pageAddresses) return result("blocked", "The requested destination is not publicly reachable.", now);
      const pageSignal = AbortSignal.any([overallSignal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
      const response = injected
        ? await injected(current.href, { method: "GET", redirect: "manual", signal: pageSignal,
          headers: { "User-Agent": PUBLIC_RESEARCH_USER_AGENT, Accept: "text/html, text/plain;q=0.9" } }, pageAddresses)
        : await pinnedRequest(current.href, { method: "GET", redirect: "manual", signal: pageSignal,
            headers: { "User-Agent": PUBLIC_RESEARCH_USER_AGENT, Accept: "text/html, text/plain;q=0.9" } }, pageAddresses);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        const next = location ? safeUrl(new URL(location, current).href) : null;
        if (!next || redirects === MAX_REDIRECTS || !(await publicDestination(next, resolveDeadline))) return result("blocked", "The redirect destination is not publicly reachable.", now);
        current = next;
        continue;
      }
      if (!response.ok) return result("inaccessible", "The public page could not be retrieved.", now);
      const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (type !== "text/html" && type !== "text/plain") return result("unsupported", "The page is not HTML or plain text.", now);
      const length = response.headers.get("content-length");
      if (length && (!/^\d+$/.test(length) || Number(length) > PUBLIC_RESEARCH_MAX_BYTES)) return result("unsupported", "The page exceeds the safe extraction limit.", now);
      let html: string;
      try { html = await readBounded(response, PUBLIC_RESEARCH_MAX_BYTES, pageSignal); }
      catch (error) { return result((error instanceof Error && error.message === "oversize") ? "unsupported" : "inaccessible", "The page could not be safely read.", now); }
      const fullText = type === "text/html" ? cleanHtml(html) : html.replace(/\s+/g, " ").trim();
      const text = fullText.slice(0, 30_000);
      const headersRobots = response.headers.get("x-robots-tag") ?? "";
      if (signal(headersRobots, /noindex|noarchive|nosnippet/i) || signal(html, /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*(?:noindex|noarchive|nosnippet)/i)) {
        return result("blocked", "The page prohibits automated research use.", now);
      }
      if (signal(fullText, /sign in|log in|subscribe|subscription|paywall|captcha|enable javascript to continue|bot detection|automated use prohibited|do not use automated|terms of use.*(?:prohibit|forbid)/i)) {
        return result(signal(fullText, /paywall|subscribe|subscription/i) ? "paywall" : "login_required", "The page requires access controls that cannot be bypassed.", now);
      }
      if (text.length < 200) return result("blocked", "The page did not contain enough extractable public content.", now);
      const retrievedAt = now().toISOString();
      const ticker = input.ticker?.trim().toUpperCase().match(/^[A-Z][A-Z0-9.-]{0,14}$/)?.[0] ?? text.match(/\b[A-Z]{1,5}\b(?=\s+(?:stock|shares|ticker))/i)?.[0]?.toUpperCase() ?? null;
      const company = titleOf(html)?.replace(/\s*[|–-].*$/, "").trim() || null;
      return { status: "extracted", finalUrl: current.href, retrievedAt, title: titleOf(html) ?? current.hostname,
        text, facts: text.split(/(?<=[.!?])\s+/).filter((x) => x.length > 40).slice(0, 20), ticker, company,
        freshness: "fresh", provenance: "server_fetched_public",
        sourceRetrieval: { finalUrl: current.href, retrievedAt, freshness: "fresh", provenance: "PUBLIC_WEB_RETRIEVAL" } };
    }
  } catch {
    return result("inaccessible", "The public page could not be safely evaluated.", now);
  }
  return result("blocked", "The page used too many redirects.", now);
}

function robotsAllows(body: string, target: URL) {
  if (!body.trim()) return false;
  const groups: Array<{ agents: string[]; rules: Array<{ pattern: string; allow: boolean; specificity: number }> }> = [];
  let group: (typeof groups)[number] | null = null;
  let rulesBegun = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); if (!line || !line.includes(":")) continue;
    const [key, ...rest] = line.split(":"); const value = rest.join(":").trim(); const field = key.trim().toLowerCase();
    if (field === "user-agent") {
      if (!group || rulesBegun) { group = { agents: [], rules: [] }; groups.push(group); rulesBegun = false; }
      group.agents.push(value.toLowerCase()); continue;
    }
    if (!group || (field !== "allow" && field !== "disallow")) continue;
    rulesBegun = true;
    if (field === "disallow" && value === "") continue;
    try {
      const pattern = decodeURIComponent(value);
      if (pattern.length > 500 || groups.reduce((sum, item) => sum + item.rules.length, 0) >= 200) return false;
      group.rules.push({ pattern, allow: field === "allow", specificity: pattern.replace(/[*$]/g, "").length });
    } catch { return false; }
  }
  const token = PUBLIC_RESEARCH_CRAWLER_TOKEN.toLowerCase();
  const specificity = (group: (typeof groups)[number]) => Math.max(0, ...group.agents
    .map((agent) => agent.split("/", 1)[0])
    .filter((agent) => agent !== "*" && token.startsWith(agent))
    .map((agent) => agent.length));
  const best = Math.max(0, ...groups.map(specificity));
  const applicable = best > 0 ? groups.filter((group) => specificity(group) === best) : groups.filter((g) => g.agents.includes("*"));
  if (!applicable.length) return false;
  let path: string;
  try { path = decodeURIComponent(`${target.pathname}${target.search}`); } catch { return false; }
  if (path.length > 4096) return false;
  let work = 0;
  const matching: Array<{ pattern: string; allow: boolean; specificity: number }> = [];
  for (const rule of applicable.flatMap((g) => g.rules)) {
    work += rule.pattern.length * Math.max(1, path.length);
    if (work > 250_000) return false;
    if (robotsGlobMatch(rule.pattern, path)) matching.push(rule);
  }
  if (!matching.length) return true;
  matching.sort((a, b) => b.specificity - a.specificity || Number(b.allow) - Number(a.allow));
  return matching[0].allow;
}

function robotsGlobMatch(pattern: string, path: string) {
  const anchored = pattern.endsWith("$");
  const glob = anchored ? pattern.slice(0, -1) : `${pattern}*`;
  let previous = new Uint8Array(path.length + 1); previous[0] = 1;
  for (const char of glob) {
    const next = new Uint8Array(path.length + 1);
    if (char === "*") {
      next[0] = previous[0];
      for (let j = 1; j <= path.length; j++) next[j] = previous[j] || next[j - 1] ? 1 : 0;
    } else {
      for (let j = 1; j <= path.length; j++) if (previous[j - 1] && path[j - 1] === char) next[j] = 1;
    }
    previous = next;
  }
  return previous[path.length] === 1;
}