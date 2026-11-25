export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface FarmStep {
  action: string;
  cost: string;
  time: string;
  note?: string;
}

export interface RadarRow extends Protocol {
  rank: number;
  age_days: number | null;
  token_status: "pre-token";
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
  };
  farm_steps: string[];
  plan: FarmStep[];
  on_watchlist: boolean;
  below_floor: boolean;
}

export interface LiveRow extends Protocol {
  token_status: "live";
}

export const MODEL = {
  version: "field-notes-2",
  base_multiple: 0.18,
  growth_weight: 0.35,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
};

const DAY = 86_400_000;
const VERSIONED = /\s(?:V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
const PRODUCT_WORD = /\b(?:wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const EXCLUDED_CATEGORIES = new Set([
  "Bridge", "Canonical Bridge", "Liquid Staking", "Liquid Restaking", "Restaked BTC", "CEX",
]);

export function parseSnapshot(text: string): Snapshot {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("snapshot input is not valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("snapshot input must be an object");
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.as_of !== "string" || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error("snapshot is missing as_of, protocols, or watchlist");
  }
  const protocols = raw.protocols.map((item, index): Protocol => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`protocol ${index} is not an object`);
    }
    const row = item as Record<string, unknown>;
    if (typeof row.slug !== "string" || typeof row.name !== "string" ||
        typeof row.tvl_usd !== "number" || !Number.isFinite(row.tvl_usd)) {
      throw new Error(`protocol ${index} has an invalid slug, name, or TVL`);
    }
    return {
      slug: row.slug,
      name: row.name,
      category: typeof row.category === "string" ? row.category : null,
      chains: Array.isArray(row.chains) ? row.chains.filter((chain): chain is string => typeof chain === "string") : [],
      tvl_usd: row.tvl_usd,
      change_7d: typeof row.change_7d === "number" && Number.isFinite(row.change_7d) ? row.change_7d : null,
      mcap_usd: typeof row.mcap_usd === "number" && Number.isFinite(row.mcap_usd) ? row.mcap_usd : null,
      listed_at: typeof row.listed_at === "string" ? row.listed_at : null,
      gecko_id: typeof row.gecko_id === "string" ? row.gecko_id : null,
      symbol: typeof row.symbol === "string" ? row.symbol : null,
    };
  });
  if (typeof raw.source !== "string" || typeof raw.floor_usd !== "number" ||
      raw.watchlist.some((slug) => typeof slug !== "string")) {
    throw new Error("snapshot source, floor, or watchlist is invalid");
  }
  return {
    as_of: raw.as_of,
    source: raw.source,
    floor_usd: raw.floor_usd,
    protocols,
    watchlist: raw.watchlist as string[],
  };
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / DAY));
}

function isPreToken(protocol: Protocol): boolean {
  return protocol.mcap_usd === null && protocol.gecko_id === null && protocol.symbol === null;
}

function isIndependentCandidate(protocol: Protocol): boolean {
  return isPreToken(protocol) &&
    !EXCLUDED_CATEGORIES.has(protocol.category ?? "") &&
    !VERSIONED.test(protocol.name) &&
    !PRODUCT_WORD.test(protocol.name) &&
    !EXCHANGE_PREFIX.test(protocol.name);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function valueFor(protocol: Protocol, asOf: string) {
  const age = ageDays(asOf, protocol.listed_at);
  const growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, protocol.change_7d ?? 0));
  const growthMultiplier = 1 + (growth / 100) * MODEL.growth_weight;
  const ageForModel = age ?? MODEL.unknown_age_days;
  const maturityMultiplier = MODEL.maturity_floor +
    Math.min(ageForModel, MODEL.maturity_days) / MODEL.maturity_days * MODEL.maturity_range;
  return {
    age,
    growth,
    growthMultiplier,
    maturityMultiplier,
    implied: Math.max(1, Math.round(
      protocol.tvl_usd * MODEL.base_multiple * growthMultiplier * maturityMultiplier,
    )),
  };
}

function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  return 50;
}

function farmPlan(protocol: Protocol, age: number | null): FarmStep[] {
  const capital = capitalFor(protocol.tvl_usd);
  const chain = protocol.chains[0] ?? "the protocol's supported network";
  const category = (protocol.category ?? "").toLowerCase();
  const holdDays = age !== null && age < 180 ? 60 : age !== null && age < 365 ? 45 : 30;
  let action = `Test the smallest useful ${protocol.name} app action on ${chain}; do not borrow or use leverage.`;
  let cost = `$${capital} test capital; about $4 gas`;
  let note: string | undefined;

  if (category.includes("lend") || category.includes("credit") || category.includes("cdp")) {
    action = `Supply up to $${capital} of a supported stable asset to ${protocol.name} on ${chain}; avoid borrowing.`;
    cost = `$${capital} capital, estimated $4 gas`;
  } else if (category.includes("dex") || category.includes("yield") || category.includes("liquidity")) {
    action = `Add up to $${capital} to a deep ${protocol.name} pool on ${chain}, then record the position.`;
    cost = `$${capital} capital, estimated $6 gas`;
    note = "Liquidity can lose value through price divergence; use a pool you understand.";
  } else if (category.includes("staking") || category.includes("restak")) {
    action = `Stake no more than $${capital} of the supported asset with ${protocol.name} on ${chain}.`;
    cost = `$${capital} capital, estimated $4 gas`;
    note = "Check lockups and withdrawal terms before staking.";
  } else if (category.includes("vault") || category.includes("curator") || category.includes("allocator")) {
    action = `Deposit up to $${capital} into a reviewed ${protocol.name} vault on ${chain}.`;
    cost = `$${capital} capital, estimated $5 gas`;
    note = "Review the vault's strategy and withdrawal conditions first.";
  } else if (category.includes("perpetual") || category.includes("derivative")) {
    action = `Use only a no-leverage demo or small spot action in ${protocol.name} on ${chain}.`;
    cost = `$${capital} maximum test capital, estimated $5 gas`;
    note = "Perpetuals and derivatives can lose the full amount; no leveraged position is suggested.";
  } else if (category.includes("rwa")) {
    action = `Read eligibility and redemption rules, then test a supported ${protocol.name} action on ${chain}.`;
    cost = `up to $${capital} test capital plus estimated $5 gas`;
    note = "RWA access may be restricted and redemption may take time.";
  }

  return [
    { action: `Check the official app and supported network for ${protocol.name}; verify the domain independently.`, cost: "no capital; 5 minutes", time: "5 min" },
    { action, cost, time: "10–20 min", ...(note ? { note } : {}) },
    { action: "If useful, repeat one ordinary action weekly and keep the transaction IDs; skip activity that adds no real utility.", cost: "about $2 gas per week; fees vary", time: "10 min / week" },
    { action: `Keep the position only while its risks suit you; review it after ${holdDays} days and exit if the thesis changes.`, cost: `$${capital} remains exposed until withdrawn`, time: `${holdDays} days` },
    { action: "Check the protocol's own points or rewards page before claiming; no token, airdrop, or reward is confirmed by this snapshot.", cost: "free to check; never pay a claim fee to an unknown site", time: "5 min" },
    { action: "Record deposits, withdrawals, fees, and dates; compare net costs with any published eligibility terms.", cost: "no added capital", time: "5 min" },
  ];
}

function textStep(step: FarmStep): string {
  const text = `${step.action} Cost: ${step.cost}. Time: ${step.time}.${step.note ? ` Note: ${step.note}` : ""}`;
  return text.length <= 600 ? text : `${text.slice(0, 596)}...`;
}

export function buildRadar(snapshot: Snapshot) {
  const protocolsBySlug = new Map(snapshot.protocols.map((protocol) => [protocol.slug, protocol]));
  const chosen = new Map<string, Protocol>();
  for (const slug of snapshot.watchlist) {
    const protocol = protocolsBySlug.get(slug);
    if (!protocol) throw new Error(`watchlist protocol ${slug} is absent from the snapshot`);
    chosen.set(slug, protocol);
  }
  for (const protocol of snapshot.protocols) {
    if (isIndependentCandidate(protocol)) chosen.set(protocol.slug, protocol);
  }

  const rows = [...chosen.values()].map((protocol) => {
    const value = valueFor(protocol, snapshot.as_of);
    const plan = farmPlan(protocol, value.age);
    return {
      ...protocol,
      age_days: value.age,
      token_status: "pre-token" as const,
      implied_value_usd: value.implied,
      model: {
        base_multiple: MODEL.base_multiple,
        growth_pct: value.growth,
        growth_multiplier: round4(value.growthMultiplier),
        maturity_multiplier: round4(value.maturityMultiplier),
      },
      farm_steps: plan.map(textStep),
      plan,
      on_watchlist: snapshot.watchlist.includes(protocol.slug),
      below_floor: protocol.tvl_usd < snapshot.floor_usd,
    };
  }).sort((a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const live = snapshot.protocols.filter((protocol) => !isPreToken(protocol))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 30)
    .map((protocol) => ({ ...protocol, token_status: "live" as const }));
  const watchlistCovered = rows.filter((row) => row.on_watchlist).length;
  if (rows.length < 100 || watchlistCovered !== snapshot.watchlist.length) {
    throw new Error(`board has ${rows.length} rows and covers ${watchlistCovered}/${snapshot.watchlist.length} watchlist entries`);
  }
  for (const row of rows) {
    if (row.farm_steps.length < 3 || row.farm_steps.some((step) => step.trim().length < 20 || step.trim().length > 600)) {
      throw new Error(`invalid farm plan for ${row.slug}`);
    }
  }
  return { rows, live };
}
