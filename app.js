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
  "three-musketeers",
  "sparky",
];

const IMG_BASE = "https://royaleapi.github.io/cr-api-assets/cards/";
const STORAGE_KEY = "cr-anti-maker-v3";
const PREV_STORAGE_KEYS = ["cr-anti-maker-v2", "cr-anti-maker-v1"];

const state = {
  cards: [],
  byKey: new Map(),
  winConds: [],
  activeWc: null,
  selections: {},
  wcVariants: {},
  editing: null, // anti key being edited
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
  editDrawer: document.getElementById("edit-drawer"),
  edCardName: document.getElementById("ed-card-name"),
  edClose: document.getElementById("ed-close"),
  edNote: document.getElementById("ed-note"),
  edChips: document.getElementById("ed-chips"),
  edCondSearch: document.getElementById("ed-cond-search"),
  edSuggest: document.getElementById("ed-suggest"),
  edModeBtns: document.querySelectorAll(".ed-mode-btn"),
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

  els.edClose.addEventListener("click", closeEditor);
  els.edNote.addEventListener("input", () => {
    const sel = currentEditingFlags();
    if (!sel) return;
    sel.note = els.edNote.value;
    saveSelections();
    renderAllGrid();
    renderSummary();
  });
  els.edModeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      const sel = currentEditingFlags();
      if (!sel) return;
      sel.condMode = mode;
      saveSelections();
      renderEditorMode();
      renderSummary();
    });
  });
  els.edCondSearch.addEventListener("input", renderSuggestions);
  els.edCondSearch.addEventListener("focus", renderSuggestions);
  els.edCondSearch.addEventListener("blur", () => {
    setTimeout(() => (els.edSuggest.hidden = true), 150);
  });
}

function loadSelections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state.selections = data.selections || {};
      state.wcVariants = data.wcVariants || {};
      return;
    }
    // migrate from v2
    const v2 = localStorage.getItem("cr-anti-maker-v2");
    if (v2) {
      const data = JSON.parse(v2);
      const sels = data.selections || {};
      for (const [wc, antis] of Object.entries(sels)) {
        state.selections[wc] = {};
        for (const [k, flags] of Object.entries(antis)) {
          state.selections[wc][k] = {
            evo: !!flags.evo,
            champ: !!flags.champ,
            note: "",
            condMode: "absent",
            condCards: [],
          };
        }
      }
      state.wcVariants = data.wcVariants || {};
      return;
    }
    // migrate from v1
    const v1 = localStorage.getItem("cr-anti-maker-v1");
    if (v1) {
      const old = JSON.parse(v1);
      for (const [wc, arr] of Object.entries(old)) {
        state.selections[wc] = {};
        for (const k of arr) {
          state.selections[wc][k] = {
            evo: false,
            champ: false,
            note: "",
            condMode: "absent",
            condCards: [],
          };
        }
      }
    }
  } catch {}
}

function saveSelections() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ selections: state.selections, wcVariants: state.wcVariants })
  );
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

function defaultAntiState() {
  return { evo: false, champ: false, note: "", condMode: "absent", condCards: [] };
}

function hasMeta(flags) {
  if (!flags) return false;
  return (flags.note && flags.note.trim().length > 0) || (flags.condCards && flags.condCards.length > 0);
}

function currentEditingFlags() {
  if (!state.editing || !state.activeWc) return null;
  return state.selections[state.activeWc]?.[state.editing] || null;
}

function renderWcGrid() {
  els.wcGrid.innerHTML = "";
  for (const card of state.winConds) {
    const variants = state.wcVariants[card.key] || { evo: false, champ: false };
    const el = cardEl(card, { showBadges: true, selectionState: variants });
    if (state.activeWc === card.key) el.classList.add("active");
    const count = antiKeysOf(card.key).length;
    if (count > 0) {
      const name = el.querySelector(".name");
      name.textContent = `${card.name} (${count})`;
    }
    el.querySelector(".card-img-wrap").addEventListener("click", () =>
      selectWc(card.key)
    );
    el.querySelector(".name").addEventListener("click", () => selectWc(card.key));
    const evoCb = el.querySelector(".cb-evo");
    if (evoCb) {
      evoCb.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleWcVariant(card.key, "evo");
      });
    }
    const champCb = el.querySelector(".cb-champ");
    if (champCb) {
      champCb.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleWcVariant(card.key, "champ");
      });
    }
    els.wcGrid.appendChild(el);
  }
  updateCounter();
}

function toggleWcVariant(wcKey, kind) {
  if (!state.wcVariants[wcKey]) state.wcVariants[wcKey] = { evo: false, champ: false };
  const flags = state.wcVariants[wcKey];
  const next = !flags[kind];
  flags[kind] = next;
  if (next) {
    const other = kind === "evo" ? "champ" : "evo";
    flags[other] = false;
  }
  if (!flags.evo && !flags.champ) delete state.wcVariants[wcKey];
  saveSelections();
  renderWcGrid();
  renderSummary();
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
    const isSelected = !!sel[card.key];
    const el = cardEl(card, {
      showBadges: true,
      selectionState: sel[card.key],
      showEditIcon: isSelected,
    });
    if (isSelected) el.classList.add("selected");
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
    const editIcon = el.querySelector(".edit-icon");
    if (editIcon) {
      editIcon.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditor(card.key);
      });
    }
    els.allGrid.appendChild(el);
  }
}

function cardEl(card, { showBadges = false, selectionState = null, showEditIcon = false } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.dataset.key = card.key;

  if (showEditIcon) {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "edit-icon";
    editBtn.textContent = "✎";
    editBtn.title = "Not / koşul ekle";
    if (hasMeta(selectionState)) editBtn.classList.add("has-meta");
    wrap.appendChild(editBtn);
  }

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
  state.editing = null;
  els.antiPanel.hidden = false;
  els.editDrawer.hidden = true;
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
    if (state.editing === antiKey) closeEditor();
  } else {
    state.selections[wc][antiKey] = defaultAntiState();
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
    state.selections[wc][antiKey] = defaultAntiState();
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

function openEditor(antiKey) {
  if (!state.activeWc) return;
  if (!state.selections[state.activeWc]?.[antiKey]) return;
  state.editing = antiKey;
  const flags = state.selections[state.activeWc][antiKey];
  // backfill missing fields for old data
  if (flags.note === undefined) flags.note = "";
  if (flags.condMode === undefined) flags.condMode = "absent";
  if (flags.condCards === undefined) flags.condCards = [];

  els.edCardName.textContent = state.byKey.get(antiKey)?.name || antiKey;
  els.edNote.value = flags.note;
  els.edCondSearch.value = "";
  els.edSuggest.hidden = true;
  renderEditorMode();
  renderChips();
  els.editDrawer.hidden = false;
  els.editDrawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  els.edNote.focus();
}

function closeEditor() {
  state.editing = null;
  els.editDrawer.hidden = true;
  renderAllGrid();
}

function renderEditorMode() {
  const flags = currentEditingFlags();
  const mode = flags?.condMode || "absent";
  els.edModeBtns.forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
}

function renderChips() {
  const flags = currentEditingFlags();
  els.edChips.innerHTML = "";
  if (!flags) return;
  for (const k of flags.condCards) {
    const chip = document.createElement("span");
    chip.className = "ed-chip";
    const name = document.createElement("span");
    name.textContent = state.byKey.get(k)?.name || k;
    const x = document.createElement("span");
    x.className = "x";
    x.textContent = "×";
    x.addEventListener("click", () => removeCondCard(k));
    chip.appendChild(name);
    chip.appendChild(x);
    els.edChips.appendChild(chip);
  }
}

function renderSuggestions() {
  const flags = currentEditingFlags();
  if (!flags) return;
  const q = els.edCondSearch.value.trim().toLowerCase();
  if (!q) {
    els.edSuggest.hidden = true;
    return;
  }
  const taken = new Set(flags.condCards);
  const matches = state.cards
    .filter((c) => !taken.has(c.key) && c.key !== state.editing)
    .filter((c) => c.name.toLowerCase().includes(q) || c.key.includes(q))
    .slice(0, 8);
  els.edSuggest.innerHTML = "";
  if (matches.length === 0) {
    els.edSuggest.hidden = true;
    return;
  }
  for (const c of matches) {
    const item = document.createElement("div");
    item.className = "ed-suggest-item";
    item.textContent = c.name;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      addCondCard(c.key);
    });
    els.edSuggest.appendChild(item);
  }
  els.edSuggest.hidden = false;
}

function addCondCard(key) {
  const flags = currentEditingFlags();
  if (!flags) return;
  if (!flags.condCards.includes(key)) flags.condCards.push(key);
  els.edCondSearch.value = "";
  els.edSuggest.hidden = true;
  saveSelections();
  renderChips();
  renderAllGrid();
  renderSummary();
}

function removeCondCard(key) {
  const flags = currentEditingFlags();
  if (!flags) return;
  flags.condCards = flags.condCards.filter((k) => k !== key);
  saveSelections();
  renderChips();
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
    head.textContent = labelFor(wcKey, state.wcVariants[wcKey]) + " →";
    const body = document.createElement("div");
    body.className = "antis";
    body.innerHTML = Object.entries(antiMap)
      .map(([k, flags]) => {
        const txt = labelFor(k, flags);
        const cond = condText(flags);
        const note = (flags.note || "").trim();
        const extra = [cond, note].filter(Boolean).join(" • ");
        return extra
          ? `${escapeHtml(txt)} <em>(${escapeHtml(extra)})</em>`
          : escapeHtml(txt);
      })
      .join(", ");
    row.appendChild(head);
    row.appendChild(body);
    els.summary.appendChild(row);
  }
  els.output.value = buildOutputText(entries);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function condText(flags) {
  if (!flags || !flags.condCards || flags.condCards.length === 0) return "";
  const names = flags.condCards.map((k) => state.byKey.get(k)?.name || k);
  const prefix = flags.condMode === "present" ? "varsa" : "yoksa";
  return `${prefix}: ${names.join(", ")}`;
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
    lines.push(`▸ ${labelFor(wcKey, state.wcVariants[wcKey])}`);
    for (const [k, flags] of Object.entries(antiMap)) {
      let line = `   - ${labelFor(k, flags)}`;
      const cond = condText(flags);
      const note = (flags.note || "").trim();
      const extra = [cond, note].filter(Boolean).join(" • ");
      if (extra) line += ` (${extra})`;
      lines.push(line);
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
  state.wcVariants = {};
  state.activeWc = null;
  state.editing = null;
  saveSelections();
  els.antiPanel.hidden = true;
  els.editDrawer.hidden = true;
  renderWcGrid();
  renderSummary();
}

init();
