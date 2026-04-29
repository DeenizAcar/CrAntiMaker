const WIN_CONDITION_KEYS = [
  "hog-rider",
  "royal-hogs",
  "ram-rider",
  "battle-ram",
  "wall-breakers",
  "miner",
  "goblin-barrel",
  "goblin-drill",
  "graveyard",
  "balloon",
  "lava-hound",
  "skeleton-barrel",
  "x-bow",
  "mortar",
  "giant",
  "royal-giant",
  "golem",
  "goblin-giant",
  "elixir-golem",
  "electro-giant",
  "mega-knight",
  "three-musketeers",
  "sparky",
];

const IMG_BASE = "https://royaleapi.github.io/cr-api-assets/cards/";
const STORAGE_KEY = "cr-anti-maker-v2";

const state = {
  cards: [],
  byKey: new Map(),
  winConds: [],
  activeWc: null,
  selections: {},
};

const els = {
  wcGrid: document.getElementById("wc-grid"),
  allGrid: document.getElementById("all-grid"),
  antiPanel: document.getElementById("anti-panel"),
  antiTitle: document.getElementById("anti-title"),
  search: document.getElementById("search"),
  summaryPanel: document.getElementById("summary-panel"),
  summary: document.getElementById("summary"),
  output: document.getElementById("output"),
  copyBtn: document.getElementById("copy-btn"),
  resetBtn: document.getElementById("reset-btn"),
  counter: document.getElementById("counter"),
};

async function init() {
  const res = await fetch("cards.json");
  state.cards = await res.json();
  state.byKey = new Map(state.cards.map((c) => [c.key, c]));
  state.winConds = WIN_CONDITION_KEYS
    .map((k) => state.byKey.get(k))
    .filter(Boolean);

  loadSelections();
  renderWcGrid();
  renderAllGrid();
  renderSummary();

  els.search.addEventListener("input", renderAllGrid);
  els.copyBtn.addEventListener("click", onCopy);
  els.resetBtn.addEventListener("click", onReset);
}

function loadSelections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state.selections = JSON.parse(raw);
    else {
      const oldRaw = localStorage.getItem("cr-anti-maker-v1");
      if (oldRaw) {
        const old = JSON.parse(oldRaw);
        for (const [wc, arr] of Object.entries(old)) {
          state.selections[wc] = {};
          for (const k of arr) state.selections[wc][k] = { evo: false, champ: false };
        }
      }
    }
  } catch {}
}

function saveSelections() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.selections));
}

function isChampion(card) {
  return !!(card && card.hasChamp);
}
function hasEvo(card) {
  return !!(card && card.hasEvo);
}

function antisOf(wcKey) {
  return state.selections[wcKey] || {};
}

function antiKeysOf(wcKey) {
  return Object.keys(antisOf(wcKey));
}

function renderWcGrid() {
  els.wcGrid.innerHTML = "";
  for (const card of state.winConds) {
    const el = cardEl(card, { showBadges: false });
    if (state.activeWc === card.key) el.classList.add("active");
    const count = antiKeysOf(card.key).length;
    if (count > 0) {
      const name = el.querySelector(".name");
      name.textContent = `${card.name} (${count})`;
    }
    el.addEventListener("click", () => selectWc(card.key));
    els.wcGrid.appendChild(el);
  }
  updateCounter();
}

function renderAllGrid() {
  els.allGrid.innerHTML = "";
  if (!state.activeWc) return;
  const q = els.search.value.trim().toLowerCase();
  const sel = antisOf(state.activeWc);
  const list = state.cards.filter((c) =>
    !q ? true : c.name.toLowerCase().includes(q) || c.key.includes(q)
  );
  for (const card of list) {
    const el = cardEl(card, { showBadges: true, selectionState: sel[card.key] });
    if (sel[card.key]) el.classList.add("selected");
    el.querySelector(".card-img-wrap").addEventListener("click", () =>
      toggleAnti(card.key)
    );
    const evoCb = el.querySelector(".cb-evo");
    if (evoCb) {
      evoCb.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleVariant(card.key, "evo");
      });
    }
    const champCb = el.querySelector(".cb-champ");
    if (champCb) {
      champCb.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleVariant(card.key, "champ");
      });
    }
    els.allGrid.appendChild(el);
  }
}

function cardEl(card, { showBadges = false, selectionState = null } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.dataset.key = card.key;

  const imgWrap = document.createElement("div");
  imgWrap.className = "card-img-wrap";
  const img = document.createElement("img");
  img.src = IMG_BASE + card.key + ".png";
  img.alt = card.name;
  img.loading = "lazy";
  img.onerror = () => {
    imgWrap.classList.add("img-fallback");
    imgWrap.dataset.fallback = card.name;
    img.remove();
  };
  imgWrap.appendChild(img);
  wrap.appendChild(imgWrap);

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = card.name;
  wrap.appendChild(name);

  if (showBadges && (hasEvo(card) || isChampion(card))) {
    const badges = document.createElement("div");
    badges.className = "badges";
    if (hasEvo(card)) {
      badges.appendChild(badgeEl("evo", selectionState?.evo));
    }
    if (isChampion(card)) {
      badges.appendChild(badgeEl("champ", selectionState?.champ));
    }
    wrap.appendChild(badges);
  }

  return wrap;
}

function badgeEl(kind, checked) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "badge cb-" + kind + (checked ? " checked" : "");
  b.title = kind === "evo" ? "Evrim" : "Kahraman";
  b.setAttribute("aria-label", b.title);
  b.setAttribute("aria-pressed", checked ? "true" : "false");
  return b;
}

function selectWc(key) {
  state.activeWc = key;
  els.antiPanel.hidden = false;
  els.antiTitle.textContent = state.byKey.get(key).name;
  els.search.value = "";
  renderWcGrid();
  renderAllGrid();
  els.antiPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleAnti(antiKey) {
  if (!state.activeWc) return;
  if (antiKey === state.activeWc) return;
  const wc = state.activeWc;
  if (!state.selections[wc]) state.selections[wc] = {};
  if (state.selections[wc][antiKey]) {
    delete state.selections[wc][antiKey];
  } else {
    state.selections[wc][antiKey] = { evo: false, champ: false };
  }
  if (Object.keys(state.selections[wc]).length === 0) delete state.selections[wc];
  saveSelections();
  renderWcGrid();
  renderAllGrid();
  renderSummary();
}

function toggleVariant(antiKey, kind) {
  if (!state.activeWc) return;
  const wc = state.activeWc;
  if (!state.selections[wc]) state.selections[wc] = {};
  if (!state.selections[wc][antiKey]) {
    state.selections[wc][antiKey] = { evo: false, champ: false };
  }
  const flags = state.selections[wc][antiKey];
  const next = !flags[kind];
  flags[kind] = next;
  if (next) {
    const other = kind === "evo" ? "champ" : "evo";
    flags[other] = false;
  }
  saveSelections();
  renderAllGrid();
  renderSummary();
}

function renderSummary() {
  const entries = Object.entries(state.selections).filter(
    ([, v]) => v && Object.keys(v).length > 0
  );
  if (entries.length === 0) {
    els.summaryPanel.hidden = true;
    return;
  }
  els.summaryPanel.hidden = false;
  els.summary.innerHTML = "";
  for (const [wcKey, antiMap] of entries) {
    const wc = state.byKey.get(wcKey);
    if (!wc) continue;
    const row = document.createElement("div");
    row.className = "summary-row";
    const head = document.createElement("div");
    head.className = "wc";
    head.textContent = wc.name + " →";
    const body = document.createElement("div");
    body.className = "antis";
    body.textContent = Object.entries(antiMap)
      .map(([k, flags]) => labelFor(k, flags))
      .join(", ");
    row.appendChild(head);
    row.appendChild(body);
    els.summary.appendChild(row);
  }
  els.output.value = buildOutputText(entries);
}

function labelFor(key, flags) {
  const name = state.byKey.get(key)?.name || key;
  const tags = [];
  if (flags?.evo) tags.push("Evo");
  if (flags?.champ) tags.push("Kahraman");
  return tags.length ? `${name} [${tags.join(" + ")}]` : name;
}

function buildOutputText(entries) {
  const lines = ["Seeok — Anti listesi", "=".repeat(28), ""];
  for (const [wcKey, antiMap] of entries) {
    const wcName = state.byKey.get(wcKey)?.name || wcKey;
    lines.push(`▸ ${wcName}`);
    for (const [k, flags] of Object.entries(antiMap)) {
      lines.push(`   - ${labelFor(k, flags)}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function updateCounter() {
  const n = Object.values(state.selections).filter(
    (v) => v && Object.keys(v).length > 0
  ).length;
  els.counter.textContent = `${n} win condition seçildi`;
}

async function onCopy() {
  const text = els.output.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    els.output.select();
    document.execCommand("copy");
  }
  els.copyBtn.classList.add("copied");
  els.copyBtn.textContent = "Kopyalandı ✓";
  setTimeout(() => {
    els.copyBtn.classList.remove("copied");
    els.copyBtn.textContent = "Kopyala";
  }, 1600);
}

function onReset() {
  if (!confirm("Tüm seçimleri silmek istediğine emin misin?")) return;
  state.selections = {};
  state.activeWc = null;
  saveSelections();
  els.antiPanel.hidden = true;
  renderWcGrid();
  renderSummary();
}

init();
