(function () {
  "use strict";
  const data = window.RADAR;
  const host = document.getElementById("app");
  if (!data || !host) return;

  const state = { query: "", category: "all", tab: "early", sort: "implied_value_usd", direction: -1 };
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  const usd = (n) => n == null ? "—" : Math.abs(n) >= 1e6 ? "$" + compact.format(n) : money.format(n);
  const pct = (n) => n == null ? "n/a" : (n > 0 ? "+" : "") + n.toFixed(2) + "%";
  const age = (days) => days == null ? "unlisted" : days >= 365 ? (days / 365).toFixed(1) + "y" : days + "d";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function candidateRows() {
    const rows = state.tab === "early" ? data.rows : data.live;
    const query = state.query.trim().toLowerCase();
    return rows.filter((row) => {
      if (state.category !== "all" && (row.category || "Other") !== state.category) return false;
      const haystack = [row.name, row.slug, row.category, ...(row.chains || [])].join(" ").toLowerCase();
      return !query || haystack.includes(query);
    }).sort((a, b) => {
      let left = a[state.sort];
      let right = b[state.sort];
      if (state.sort === "name") {
        left = String(left).toLowerCase();
        right = String(right).toLowerCase();
      }
      if (left == null) left = state.direction > 0 ? Infinity : -Infinity;
      if (right == null) right = state.direction > 0 ? Infinity : -Infinity;
      if (left < right) return -state.direction;
      if (left > right) return state.direction;
      return a.slug.localeCompare(b.slug);
    });
  }

  function render() {
    host.replaceChildren();
    const frame = node("main", "frame");
    frame.id = "main";
    frame.append(
      buildMasthead(),
      buildHero(),
      buildStats(),
      buildBoardSection(),
      buildLower(),
      buildFooter(),
    );
    host.append(frame);
  }

  function buildMasthead() {
    const header = node("header", "mast");
    const brand = node("div", "wordmark");
    brand.innerHTML = '<span class="sigil" aria-hidden="true">⌁</span><span>FIELDNOTES&nbsp; / &nbsp;TOKEN RADAR</span>';
    const meta = node("div", "mast-right");
    meta.innerHTML = `<span><i class="live-dot"></i>Snapshot locked</span><span>${esc(data.as_of)} &nbsp;·&nbsp; ${esc(data.model.version)}</span>`;
    header.append(brand, meta);
    return header;
  }

  function buildHero() {
    const hero = node("section", "hero");
    const intro = node("div");
    intro.innerHTML = `<div class="eyebrow">Onchain field guide &nbsp; / &nbsp; ${esc(data.as_of)}</div>
      <h1>Find the signal<br>before the ticker.</h1>
      <p class="dek">A ranked watchlist of protocols whose source record carries no token. Implied values are a transparent heuristic, not a launch forecast, price target, or promise of rewards.</p>`;
    const note = node("aside", "hero-note");
    note.innerHTML = `<strong>The watchlist is a floor</strong><span>${data.watchlist_size} house-watchlist names are covered, plus ${data.early_size} below-floor and ${data.other_size} other qualifying records. Missing token metadata is not proof no token exists.</span>`;
    hero.append(intro, note);
    return hero;
  }

  function buildStats() {
    const stats = node("section", "stats");
    const items = [
      ["Protocols ranked", data.board_size, "lime"],
      ["Watchlist coverage", `${data.watchlist_size} / ${data.watchlist_size}`, ""],
      ["Below-floor candidates", data.early_size, ""],
      ["Other records above floor", data.other_size, ""],
    ];
    for (const [label, value, tone] of items) {
      const cell = node("div", "stat");
      cell.innerHTML = `<span class="stat-label">${esc(label)}</span><span class="stat-value ${tone}">${esc(value)}</span>`;
      stats.append(cell);
    }
    return stats;
  }

  function buildBoardSection() {
    const section = node("section");
    const head = node("div", "section-head");
    const title = node("div", "section-title");
    title.innerHTML = `<h2>${state.tab === "early" ? "The radar" : "Already trading"}</h2><span>${state.tab === "early" ? "RANKED BY IMPLIED VALUE" : "MARKET DATA · NOT SCORED"}</span>`;
    const filters = node("div", "filters");
    const search = node("input", "search");
    search.type = "search";
    search.placeholder = "Find a protocol or chain";
    search.setAttribute("aria-label", "Search protocols");
    search.value = state.query;
    search.addEventListener("input", () => { state.query = search.value; render(); document.querySelector(".search")?.focus(); });
    const select = node("select", "select");
    select.setAttribute("aria-label", "Filter by category");
    const categories = [...new Set((state.tab === "early" ? data.rows : data.live).map((row) => row.category || "Other"))].sort();
    select.add(new Option("All categories", "all"));
    categories.forEach((category) => select.add(new Option(category, category)));
    select.value = categories.includes(state.category) ? state.category : "all";
    select.addEventListener("change", () => { state.category = select.value; render(); });
    const tabs = node("div", "tabs");
    for (const [key, label] of [["early", "Pre-token"], ["live", "Live token"]]) {
      const button = node("button", "", label);
      button.type = "button";
      button.setAttribute("aria-pressed", String(state.tab === key));
      button.addEventListener("click", () => {
        state.tab = key;
        state.category = "all";
        state.sort = key === "live" ? "mcap_usd" : "implied_value_usd";
        state.direction = -1;
        render();
      });
      tabs.append(button);
    }
    filters.append(search, select, tabs);
    head.append(title, filters);

    const rows = candidateRows();
    const result = node("div", "result-meta", `${rows.length} ${state.tab === "early" ? "ranked rows" : "live-token records"}  ·  Select a row for its working notes`);
    const panel = node("div", "board");
    const headers = state.tab === "early"
      ? [["rank", "Rank", "rank"], ["name", "Protocol", "name"], ["tvl_usd", "TVL", "tvl_usd"], ["change_7d", "7D", "change_7d"], ["age_days", "Age", "age_days"], ["implied_value_usd", "Implied value", "implied_value_usd"], ["token_status", "Record", "token_status"]]
      : [["rank", "Status", "rank"], ["name", "Protocol", "name"], ["tvl_usd", "TVL", "tvl_usd"], ["change_7d", "7D", "change_7d"], ["symbol", "Ticker", "symbol"], ["mcap_usd", "Market cap", "mcap_usd"], ["token_status", "Record", "token_status"]];
    const header = node("div", "board-head");
    headers.forEach(([key, label, sort]) => {
      const button = node("button", "sort", `${label}${state.sort === sort ? state.direction < 0 ? " ↓" : " ↑" : ""}`);
      button.type = "button";
      button.addEventListener("click", () => {
        if (state.sort === sort) state.direction *= -1;
        else { state.sort = sort; state.direction = sort === "rank" || sort === "name" ? 1 : -1; }
        render();
      });
      header.append(button);
    });
    panel.append(header);
    if (!rows.length) {
      panel.append(node("div", "empty", "No records match those filters."));
    } else {
      const max = rows[0].implied_value_usd || 1;
      rows.slice(0, 70).forEach((row, index) => panel.append(buildRow(row, index, max)));
    }
    section.append(head, result, panel);
    return section;
  }

  function buildRow(row, index, max) {
    const line = node("div", "row");
    line.tabIndex = 0;
    line.setAttribute("role", "button");
    line.setAttribute("aria-label", `View ${row.name} detail`);
    const isLive = state.tab === "live";
    const growthClass = row.change_7d == null ? "" : row.change_7d >= 0 ? "positive" : "negative";
    const rank = isLive ? "LIVE" : String(row.rank).padStart(2, "0");
    const name = `<div class="protocol"><div class="protocol-name">${esc(row.name)}</div><div class="protocol-meta">${esc(row.category || "Other")} &nbsp;·&nbsp; ${esc((row.chains || []).slice(0, 2).join(", ") || "chain unlisted")}</div></div>`;
    const metric = (value, css = "") => `<span class="number ${css}">${esc(value)}</span>`;
    const valueCell = isLive
      ? `<span class="number">${usd(row.mcap_usd)}</span>`
      : `<div class="value-cell"><div class="meter"><i style="width:${Math.max(3, Math.round(row.implied_value_usd / max * 100))}%"></i></div><span class="value">${usd(row.implied_value_usd)}</span></div>`;
    const marker = isLive ? "TOKEN LIVE" : row.on_watchlist ? "WATCHLIST" : row.below_floor ? "BELOW FLOOR" : "ADDED";
    line.innerHTML = `<span class="rank">${rank}</span>${name}${metric(usd(row.tvl_usd))}${metric(pct(row.change_7d), growthClass)}${metric(isLive ? row.symbol || "—" : age(row.age_days))}<span>${valueCell}</span><span class="badge ${row.on_watchlist ? "floor" : ""}">${marker}</span>`;
    const open = () => showDetail(row);
    line.addEventListener("click", open);
    line.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
    });
    return line;
  }

  function showDetail(row) {
    document.querySelector(".detail")?.remove();
    const dialog = node("dialog", "detail");
    const plan = row.plan || [];
    const isLive = state.tab === "live";
    const label = isLive ? "Live token · market cap, not a model" : `Rank ${row.rank} · ${row.on_watchlist ? "watchlist floor" : "early radar"}`;
    dialog.innerHTML = `<div class="detail-top"><div><div class="detail-rank">${label}</div><h2>${esc(row.name)}</h2><div class="detail-sub">${esc(row.category || "Other")} &nbsp;·&nbsp; ${esc((row.chains || []).join(", ") || "chain unlisted")}</div></div><button class="close" type="button" aria-label="Close detail">×</button></div>`;
    if (isLive) {
      dialog.insertAdjacentHTML("beforeend", `<div class="detail-value"><small>Recorded market cap</small><strong>${usd(row.mcap_usd)}</strong><span>Already trading in the source snapshot; excluded from the pre-token ranking.</span></div>`);
    } else {
      const growth = Math.min(data.model.growth_cap, Math.max(data.model.growth_floor, row.change_7d ?? 0));
      const growthMultiplier = 1 + growth / 100 * data.model.growth_weight;
      const ageForModel = row.age_days ?? data.model.unknown_age_days;
      const maturityMultiplier = data.model.maturity_floor +
        Math.min(ageForModel, data.model.maturity_days) / data.model.maturity_days * data.model.maturity_range;
      const recomputed = Math.max(1, Math.round(row.tvl_usd * data.model.base_multiple * growthMultiplier * maturityMultiplier));
      dialog.insertAdjacentHTML("beforeend", `<div class="detail-value"><small>Model-implied value · not a price target</small><strong>${usd(row.implied_value_usd)}</strong><span>On-record token status: no token metadata recorded · arithmetic check ${usd(recomputed)}</span></div>
        <div class="detail-grid">
          <div class="detail-metric"><small>TVL</small><b>${usd(row.tvl_usd)}</b></div>
          <div class="detail-metric"><small>7-day TVL move</small><b>${pct(row.change_7d)}</b></div>
          <div class="detail-metric"><small>First tracked</small><b>${age(row.age_days)}</b></div>
          <div class="detail-metric"><small>Growth factor</small><b>${row.model.growth_multiplier.toFixed(4)}×</b></div>
          <div class="detail-metric"><small>Maturity factor</small><b>${row.model.maturity_multiplier.toFixed(4)}×</b></div>
          <div class="detail-metric"><small>Watchlist</small><b>${row.on_watchlist ? "Included" : "Below floor"}</b></div>
        </div>
        <section class="detail-section"><h3>Field plan · costs & cadence</h3><ol class="steps">${plan.map((step) => `<li><b>${esc(step.action)}</b><span>Cost: ${esc(step.cost)} · Time: ${esc(step.time)}</span>${step.note ? `<em>${esc(step.note)}</em>` : ""}</li>`).join("")}</ol></section>
        <p class="caveat">A record is not a guarantee of token issuance or rewards. These are optional research steps, not financial advice; check contract, custody, lockup, liquidity and local eligibility risks before using funds.</p>`);
    }
    dialog.querySelector(".close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
  }

  function buildLower() {
    const lower = node("section", "lower");
    const model = node("article", "card");
    model.innerHTML = `<h3>How the estimate is built</h3>
      <div class="formula">TVL × 0.18 × growth factor × maturity factor</div>
      <p>Growth factor = 1 + clamp(7d change, −60%, +120%) × 0.35. Maturity = 0.55 + min(age, 1,460d) ÷ 1,460 × 0.45. Missing age assumes 365 days; same formula, no name-based overrides.</p>`;
    const signal = node("article", "card");
    signal.innerHTML = `<h3>Read the record, not the rumor</h3>
      <div class="signal"><span>Snapshot date</span><b>${esc(data.as_of)}</b></div>
      <div class="signal"><span>Source</span><b>Protocol index</b></div>
      <div class="signal"><span>Meaning of “pre-token”</span><b>No token fields recorded</b></div>
      <p>Not a prediction, token launch date, or airdrop signal. Live-token records stay in their own view.</p>`;
    lower.append(model, signal);
    return lower;
  }

  function buildFooter() {
    const footer = node("footer", "foot");
    footer.innerHTML = `<span>SOURCE SNAPSHOT &nbsp;·&nbsp; ${esc(data.as_of)} &nbsp;·&nbsp; ${esc(data.source.replace(/^.*fetched /, "fetched "))}</span><span>FIELDNOTES / MODEL ${esc(data.model.version)} &nbsp;·&nbsp; ESTIMATES ARE NOT GUARANTEES</span>`;
    return footer;
  }

  render();
})();
