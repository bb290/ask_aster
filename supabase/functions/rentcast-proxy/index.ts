// RentCast proxy for the Sagareus rental comp report widget (saga-comp-report.module).
//
// Why this exists: the widget is public on sagareus.com, so the RentCast API key
// can never ship in browser JS. This function holds the key server-side, caches
// responses by address for 24h, and enforces per-IP and global daily caps so a
// scraper cannot burn the monthly RentCast budget (~$100/mo plan).
//
// Endpoint: POST /  body: { address, propertyType?, bedrooms?, bathrooms?, squareFootage? }
// Returns:  { rent, rentRangeLow, rentRangeHigh, comparables: [...], cached, stale }
//
// Secrets (supabase secrets set ...): RENTCAST_API_KEY (required).
// Optional env overrides: RENTCAST_DAILY_CAP (default 30 upstream calls/day),
// RENTCAST_IP_DAILY_CAP (default 20 requests/IP/day), ALLOWED_ORIGINS (csv).
//
// Tables + rpc: sql/04_rentcast.sql (rentcast_cache, rentcast_usage, rentcast_increment).

import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const RENTCAST_API_KEY = Deno.env.get("RENTCAST_API_KEY") ?? "";
const DAILY_CAP = parseInt(Deno.env.get("RENTCAST_DAILY_CAP") ?? "30", 10);
const IP_DAILY_CAP = parseInt(Deno.env.get("RENTCAST_IP_DAILY_CAP") ?? "20", 10);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ??
  "https://www.sagareus.com,https://sagareus.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

const PROPERTY_TYPES = new Set([
  "Single Family", "Condo", "Townhouse", "Manufactured", "Multi-Family", "Apartment",
]);

const app = new Hono();

function corsHeaders(origin: string | undefined): Record<string, string> {
  const allowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith(".sagareus.com") ||
    origin.endsWith(".hs-sites.com") ||               // HubSpot page previews
    origin.endsWith(".hubspotpagebuilder.com")        // HubSpot editor preview
  );
  return {
    "Access-Control-Allow-Origin": allowed ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

app.options("*", (c) => new Response(null, { status: 204, headers: corsHeaders(c.req.header("origin")) }));

app.post("*", async (c) => {
  const origin = c.req.header("origin");
  const headers = { ...corsHeaders(origin), "Content-Type": "application/json" };

  // Origin gate: if a browser Origin is present, it must be ours.
  if (origin) {
    const ok = ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith(".sagareus.com") ||
      origin.endsWith(".hs-sites.com") ||
      origin.endsWith(".hubspotpagebuilder.com");
    if (!ok) return new Response(JSON.stringify({ error: "origin_not_allowed" }), { status: 403, headers });
  }

  if (!RENTCAST_API_KEY) {
    return new Response(JSON.stringify({ error: "server_not_configured", message: "RENTCAST_API_KEY is not set." }), { status: 500, headers });
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400, headers });
  }

  const address = String(body.address ?? "").trim();
  if (address.length < 8 || address.length > 200) {
    return new Response(JSON.stringify({ error: "bad_address", message: "Enter a full street address including city and state." }), { status: 400, headers });
  }
  const propertyType = PROPERTY_TYPES.has(String(body.propertyType)) ? String(body.propertyType) : "";
  const num = (v: unknown, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
  };
  const bedrooms = num(body.bedrooms, 0, 20);
  const bathrooms = num(body.bathrooms, 0, 20);
  const squareFootage = num(body.squareFootage, 100, 50000);

  const today = new Date().toISOString().slice(0, 10);
  const ip = (c.req.header("x-forwarded-for") ?? "unknown").split(",")[0].trim();

  // Per-IP cap (counts every request, cached or not; deters scripted abuse).
  const { data: ipCount, error: ipErr } = await supabase.rpc("rentcast_increment", { p_day: today, p_scope: `ip:${ip}` });
  if (!ipErr && typeof ipCount === "number" && ipCount > IP_DAILY_CAP) {
    return new Response(JSON.stringify({ error: "rate_limited", message: "Daily lookup limit reached. Try again tomorrow, or request a proposal and we'll run the numbers for you." }), { status: 429, headers });
  }

  const cacheKey = [address.toLowerCase(), propertyType, bedrooms ?? "", bathrooms ?? "", squareFootage ?? "", "v2"].join("|");
  const { data: cacheRow } = await supabase
    .from("rentcast_cache").select("payload, created_at").eq("cache_key", cacheKey).maybeSingle();

  if (cacheRow && Date.now() - new Date(cacheRow.created_at).getTime() < CACHE_TTL_MS) {
    return new Response(JSON.stringify({ ...cacheRow.payload, cached: true, stale: false }), { status: 200, headers: { ...headers, "X-Cache": "HIT" } });
  }

  // Global daily budget for upstream RentCast calls.
  const { data: globalRow } = await supabase
    .from("rentcast_usage").select("count").eq("day", today).eq("scope", "global").maybeSingle();
  if ((globalRow?.count ?? 0) >= DAILY_CAP) {
    if (cacheRow) {
      return new Response(JSON.stringify({ ...cacheRow.payload, cached: true, stale: true }), { status: 200, headers: { ...headers, "X-Cache": "STALE" } });
    }
    return new Response(JSON.stringify({ error: "budget_reached", message: "We've hit today's lookup limit. Request a proposal and we'll send your full report." }), { status: 429, headers });
  }

  // Upstream call. /avm/rent/long-term bundles the value estimate AND comparables: one call per report.
  // daysOld=365 fetches a full year of comps in the single call; the widget tiers them
  // into 3/6/12-month windows locally, so window switching costs zero extra quota.
  const qs = new URLSearchParams({ address, compCount: "25", daysOld: "365" });
  if (propertyType) qs.set("propertyType", propertyType);
  if (bedrooms !== undefined) qs.set("bedrooms", String(bedrooms));
  if (bathrooms !== undefined) qs.set("bathrooms", String(bathrooms));
  if (squareFootage !== undefined) qs.set("squareFootage", String(squareFootage));

  const upstream = await fetch(`https://api.rentcast.io/v1/avm/rent/long-term?${qs}`, {
    headers: { "X-Api-Key": RENTCAST_API_KEY, "Accept": "application/json" },
  });

  if (!upstream.ok) {
    if (cacheRow) {
      return new Response(JSON.stringify({ ...cacheRow.payload, cached: true, stale: true }), { status: 200, headers: { ...headers, "X-Cache": "STALE" } });
    }
    const status = upstream.status === 404 ? 404 : 502;
    const message = upstream.status === 404
      ? "We couldn't find that address. Check the spelling and include city and state."
      : "The rent data service is unavailable right now. Try again in a few minutes.";
    return new Response(JSON.stringify({ error: "upstream_failed", message }), { status, headers });
  }

  const raw = await upstream.json();
  await supabase.rpc("rentcast_increment", { p_day: today, p_scope: "global" });

  // Trim to exactly what the widget needs; never pass the raw payload through.
  const payload = {
    rent: raw.rent ?? null,
    rentRangeLow: raw.rentRangeLow ?? null,
    rentRangeHigh: raw.rentRangeHigh ?? null,
    comparables: (Array.isArray(raw.comparables) ? raw.comparables : []).slice(0, 25).map((x: Record<string, unknown>) => ({
      address: x.formattedAddress ?? "",
      rent: x.price ?? null,
      bedrooms: x.bedrooms ?? null,
      bathrooms: x.bathrooms ?? null,
      squareFootage: x.squareFootage ?? null,
      distance: x.distance ?? null,
      daysOld: x.daysOld ??
        (x.lastSeenDate ? Math.max(0, Math.round((Date.now() - Date.parse(String(x.lastSeenDate))) / 86400000)) : null),
      status: x.status ?? null,
    })),
  };

  await supabase.from("rentcast_cache").upsert({ cache_key: cacheKey, payload, created_at: new Date().toISOString() });

  return new Response(JSON.stringify({ ...payload, cached: false, stale: false }), { status: 200, headers: { ...headers, "X-Cache": "MISS" } });
});

app.all("*", (c) => new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { ...corsHeaders(c.req.header("origin")), "Content-Type": "application/json" } }));

Deno.serve(app.fetch);
