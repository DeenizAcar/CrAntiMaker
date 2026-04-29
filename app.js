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
const STORAGE_KEY = "cr-anti-maker-v1";

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
  } catch {}
}

function saveSelections() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.selections));
}

function renderWcGrid() {
  els.wcGrid.innerHTML = "";
  for (const card of state.winConds) {
    const el = cardEl(card);
    if (state.activeWc === card.key) el.classList.add("active");
    if ((state.selections[card.key] || []).length > 0) {
      const badge = document.createElement("span");
      badge.className = "name";
      badge.textContent = `${card.name} (${state.selections[card.key].length})`;
      el.replaceChild(badge, el.querySelector(".name"));
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
  const selected = new Set(state.selections[state.activeWc] || []);
  const list = state.cards.filter((c) =>
    !q ? true : c.name.toLowerCase().includes(q) || c.key.includes(q)
  );
  for (const card of list) {
    const el = cardEl(card);
    if (selected.has(card.key)) el.classList.add("selected");
    el.addEventListener("click", () => toggleAnti(card.key));
    els.allGrid.appendChild(el);
  }
}

function cardEl(card) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.dataset.key = card.key;
  const img = document.createElement("img");
  img.src = IMG_BASE + card.key + ".png";
  img.alt = card.name;
  img.loading = "lazy";
  img.onerror = () => {
    img.style.opacity = "0.3";
  };
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = card.name;
  wrap.appendChild(img);
  wrap.appendChild(name);
  return wrap;
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
  const list = state.selections[state.activeWc] || [];
  const idx = list.indexOf(antiKey);
  if (idx === -1) list.push(antiKey);
  else list.splice(idx, 1);
  if (list.length === 0) delete state.selections[state.activeWc];
  else state.selections[state.activeWc] = list;
  saveSelections();
  renderWcGrid();
  renderAllGrid();
  renderSummary();
}

function renderSummary() {
  const entries = Object.entries(state.selections).filter(
    ([, v]) => v && v.length > 0
  );
  if (entries.length === 0) {
    els.summaryPanel.hidden = true;
    return;
  }
  els.summaryPanel.hidden = false;
  els.summary.innerHTML = "";
  for (const [wcKey, antis] of entries) {
    const wc = state.byKey.get(wcKey);
    if (!wc) continue;
    const row = document.createElement("div");
    row.className = "summary-row";
    const head = document.createElement("div");
    head.className = "wc";
    head.textContent = wc.name + " →";
    const body = document.createElement("div");
    body.className = "antis";
    body.textContent = antis
      .map((k) => state.byKey.get(k)?.name || k)
      .join(", ");
    row.appendChild(head);
    row.appendChild(body);
    els.summary.appendChild(row);
  }
  els.output.value = buildOutputText(entries);
}

function buildOutputText(entries) {
  const lines = ["Seeok — Anti listesi", "=".repeat(28), ""];
  for (const [wcKey, antis] of entries) {
    const wcName = state.byKey.get(wcKey)?.name || wcKey;
    const antiNames = antis.map((k) => state.byKey.get(k)?.name || k);
    lines.push(`▸ ${wcName}`);
    for (const n of antiNames) lines.push(`   - ${n}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function updateCounter() {
  const n = Object.values(state.selections).filter(
    (v) => v && v.length > 0
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
