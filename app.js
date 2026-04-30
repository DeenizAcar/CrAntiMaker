const RARITY_ORDER = { Common: 0, Rare: 1, Epic: 2, Legendary: 3, Champion: 4 };

function sortCards(cards) {
  return [...cards].sort((a, b) => {
    const ra = RARITY_ORDER[a.rarity] ?? 99;
    const rb = RARITY_ORDER[b.rarity] ?? 99;
    if (ra !== rb) return ra - rb;
    if (a.elixir !== b.elixir) return a.elixir - b.elixir;
    return a.name.localeCompare(b.name);
  });
}

const IMG_BASE = "https://royaleapi.github.io/cr-api-assets/cards/";
const STORAGE_KEY = "cr-anti-maker-v4";

const state = {
  cards: [],
  byKey: new Map(),
  winConds: [],
  activeWc: null,
  selections: {},
  wcVariants: {},
  wcMeta: {}, // { wcKey: { note, condAbsent[], condPresent[] } }
  editing: null, // { kind: "anti" | "wc", key }
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
  edChipsAbsent: document.getElementById("ed-chips-absent"),
  edChipsPresent: document.getElementById("ed-chips-present"),
  edCondSearches: document.querySelectorAll(".ed-cond-search"),
  edSuggests: document.querySelectorAll(".ed-suggest"),
};

async function init() {
  const res = await fetch("cards.json");
  state.cards = sortCards(await res.json());
  state.byKey = new Map(state.cards.map((c) => [c.key, c]));
  state.winConds = state.cards;

  loadSelections();
  renderWcGrid();
  renderAllGrid();
  renderSummary();

  els.search.addEventListener("input", renderAllGrid);
  els.copyBtn.addEventListener("click", onCopy);
  els.resetBtn.addEventListener("click", onReset);

  els.edClose.addEventListener("click", closeEditor);
  els.edNote.addEventListener("input", () => {
    const meta = currentEditingMeta();
    if (!meta) return;
    meta.note = els.edNote.value;
    saveSelections();
    renderAllGrid();
    renderWcGrid();
    renderSummary();
  });
  els.edCondSearches.forEach((input) => {
    input.addEventListener("input", () => renderSuggestions(input.dataset.mode));
    input.addEventListener("focus", () => renderSuggestions(input.dataset.mode));
    input.addEventListener("blur", () => {
      const sug = suggestEl(input.dataset.mode);
      setTimeout(() => (sug.hidden = true), 150);
    });
  });
}

function loadSelections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state.selections = data.selections || {};
      state.wcVariants = data.wcVariants || {};
      state.wcMeta = data.wcMeta || {};
      return;
    }
    // migrate from v3
    const v3 = localStorage.getItem("cr-anti-maker-v3");
    if (v3) {
      const data = JSON.parse(v3);
      const sels = data.selections || {};
      for (const [wc, antis] of Object.entries(sels)) {
        state.selections[wc] = {};
        for (const [k, flags] of Object.entries(antis)) {
          state.selections[wc][k] = upgradeFlags(flags);
        }
      }
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
            condAbsent: [],
            condPresent: [],
          };
        }
      }
      state.wcVariants = data.wcVariants || {};
    }
  } catch {}
}

function upgradeFlags(flags) {
  const out = {
    evo: !!flags.evo,
    champ: !!flags.champ,
    note: flags.note || "",
    condAbsent: [],
    condPresent: [],
  };
  if (Array.isArray(flags.condCards)) {
    if (flags.condMode === "present") out.condPresent = flags.condCards.slice();
    else out.condAbsent = flags.condCards.slice();
  }
  if (Array.isArray(flags.condAbsent)) out.condAbsent = flags.condAbsent.slice();
  if (Array.isArray(flags.condPresent)) out.condPresent = flags.condPresent.slice();
  return out;
}

function saveSelections() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      selections: state.selections,
      wcVariants: state.wcVariants,
      wcMeta: state.wcMeta,
    })
  );
}

function isChampion(card) { return !!(card && card.hasChamp); }
function hasEvo(card) { return !!(card && card.hasEvo); }

function antisOf(wcKey) { return state.selections[wcKey] || {}; }
function antiKeysOf(wcKey) { return Object.keys(antisOf(wcKey)); }

function defaultAntiState() {
  return { evo: false, champ: false, note: "", condAbsent: [], condPresent: [] };
}
function defaultWcMeta() {
  return { note: "", condAbsent: [], condPresent: [] };
}

function hasMeta(flags) {
  if (!flags) return false;
  const note = (flags.note || "").trim();
  return note.length > 0 ||
    (flags.condAbsent && flags.condAbsent.length > 0) ||
    (flags.condPresent && flags.condPresent.length > 0);
}

function suggestEl(mode) {
  return document.querySelector(`.ed-suggest[data-mode="${mode}"]`);
}
function searchEl(mode) {
  return document.querySelector(`.ed-cond-search[data-mode="${mode}"]`);
}
function chipsEl(mode) {
  return mode === "absent" ? els.edChipsAbsent : els.edChipsPresent;
}

function currentEditingMeta() {
  if (!state.editing) return null;
  if (state.editing.kind === "anti") {
    if (!state.activeWc) return null;
    return state.selections[state.activeWc]?.[state.editing.key] || null;
  } else if (state.editing.kind === "wc") {
    if (!state.wcMeta[state.editing.key]) {
      state.wcMeta[state.editing.key] = defaultWcMeta();
    }
    return state.wcMeta[state.editing.key];
  }
  return null;
}

function currentEditingKey() {
  return state.editing?.key || null;
}

function renderWcGrid() {
  els.wcGrid.innerHTML = "";
  for (const card of state.winConds) {
    const variants = state.wcVariants[card.key] || { evo: false, champ: false };
    const meta = state.wcMeta[card.key];
    const el = cardEl(card, {
      showBadges: true,
      selectionState: variants,
      showEditIcon: true,
      meta,
    });
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
    const editIcon = el.querySelector(".edit-icon");
    if (editIcon) {
      editIcon.addEventListener("click", (e) => {
        e.stopPropagation();
        openWcEditor(card.key);
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
      meta: sel[card.key],
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
        openAntiEditor(card.key);
      });
    }
    els.allGrid.appendChild(el);
  }
}

function cardEl(card, { showBadges = false, selectionState = null, showEditIcon = false, meta = null } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.dataset.key = card.key;

  if (showEditIcon) {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "edit-icon";
    editBtn.textContent = "✎";
    editBtn.title = "Not / koşul ekle";
    if (hasMeta(meta)) editBtn.classList.add("has-meta");
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
    if (state.editing?.kind === "anti" && state.editing.key === antiKey) {
      closeEditor();
    }
    if (Object.keys(state.selections[wc]).length === 0) delete state.selections[wc];
    saveSelections();
    renderWcGrid();
    renderAllGrid();
    renderSummary();
  } else {
    state.selections[wc][antiKey] = defaultAntiState();
    saveSelections();
    renderWcGrid();
    renderAllGrid();
    renderSummary();
    openAntiEditor(antiKey);
  }
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

function openAntiEditor(antiKey) {
  if (!state.activeWc) return;
  if (!state.selections[state.activeWc]?.[antiKey]) return;
  const flags = state.selections[state.activeWc][antiKey];
  // backfill
  if (flags.note === undefined) flags.note = "";
  if (!Array.isArray(flags.condAbsent)) flags.condAbsent = [];
  if (!Array.isArray(flags.condPresent)) flags.condPresent = [];

  state.editing = { kind: "anti", key: antiKey };
  openEditorUI(state.byKey.get(antiKey)?.name || antiKey, flags);
}

function openWcEditor(wcKey) {
  if (!state.wcMeta[wcKey]) state.wcMeta[wcKey] = defaultWcMeta();
  state.editing = { kind: "wc", key: wcKey };
  openEditorUI(state.byKey.get(wcKey)?.name || wcKey, state.wcMeta[wcKey]);
}

function openEditorUI(title, meta) {
  els.edCardName.textContent = title;
  els.edNote.value = meta.note || "";
  els.edCondSearches.forEach((i) => (i.value = ""));
  els.edSuggests.forEach((s) => (s.hidden = true));
  renderChips("absent");
  renderChips("present");
  els.editDrawer.hidden = false;
  els.editDrawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  els.edNote.focus();
}

function closeEditor() {
  // clean up empty wc meta
  if (state.editing?.kind === "wc") {
    const m = state.wcMeta[state.editing.key];
    if (m && !hasMeta(m)) delete state.wcMeta[state.editing.key];
  }
  state.editing = null;
  els.editDrawer.hidden = true;
  saveSelections();
  renderAllGrid();
  renderWcGrid();
  renderSummary();
}

function renderChips(mode) {
  const meta = currentEditingMeta();
  const container = chipsEl(mode);
  container.innerHTML = "";
  if (!meta) return;
  const list = mode === "absent" ? meta.condAbsent : meta.condPresent;
  for (const k of list) {
    const chip = document.createElement("span");
    chip.className = "ed-chip";
    const name = document.createElement("span");
    name.textContent = state.byKey.get(k)?.name || k;
    const x = document.createElement("span");
    x.className = "x";
    x.textContent = "×";
    x.addEventListener("click", () => removeCondCard(mode, k));
    chip.appendChild(name);
    chip.appendChild(x);
    container.appendChild(chip);
  }
}

function renderSuggestions(mode) {
  const meta = currentEditingMeta();
  if (!meta) return;
  const input = searchEl(mode);
  const sug = suggestEl(mode);
  const q = input.value.trim().toLowerCase();
  if (!q) { sug.hidden = true; return; }
  const editingKey = currentEditingKey();
  const list = mode === "absent" ? meta.condAbsent : meta.condPresent;
  const taken = new Set(list);
  const matches = state.cards
    .filter((c) => !taken.has(c.key) && c.key !== editingKey)
    .filter((c) => c.name.toLowerCase().includes(q) || c.key.includes(q))
    .slice(0, 8);
  sug.innerHTML = "";
  if (matches.length === 0) { sug.hidden = true; return; }
  for (const c of matches) {
    const item = document.createElement("div");
    item.className = "ed-suggest-item";
    item.textContent = c.name;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      addCondCard(mode, c.key);
    });
    sug.appendChild(item);
  }
  sug.hidden = false;
}

function addCondCard(mode, key) {
  const meta = currentEditingMeta();
  if (!meta) return;
  const list = mode === "absent" ? meta.condAbsent : meta.condPresent;
  if (!list.includes(key)) list.push(key);
  searchEl(mode).value = "";
  suggestEl(mode).hidden = true;
  saveSelections();
  renderChips(mode);
  renderAllGrid();
  renderWcGrid();
  renderSummary();
}

function removeCondCard(mode, key) {
  const meta = currentEditingMeta();
  if (!meta) return;
  if (mode === "absent") {
    meta.condAbsent = meta.condAbsent.filter((k) => k !== key);
  } else {
    meta.condPresent = meta.condPresent.filter((k) => k !== key);
  }
  saveSelections();
  renderChips(mode);
  renderAllGrid();
  renderWcGrid();
  renderSummary();
}

function condText(meta) {
  if (!meta) return "";
  const parts = [];
  if (meta.condAbsent && meta.condAbsent.length > 0) {
    parts.push("rakipte yoksa: " + meta.condAbsent.map(nameOf).join(", "));
  }
  if (meta.condPresent && meta.condPresent.length > 0) {
    parts.push("rakipte varsa: " + meta.condPresent.map(nameOf).join(", "));
  }
  return parts.join(" • ");
}

function nameOf(key) {
  return state.byKey.get(key)?.name || key;
}

function metaExtras(meta) {
  if (!meta) return "";
  const cond = condText(meta);
  const note = (meta.note || "").trim();
  return [cond, note].filter(Boolean).join(" • ");
}

function renderSummary() {
  const wcEntries = Object.entries(state.selections).filter(
    ([, v]) => v && Object.keys(v).length > 0
  );
  // also include wcs that only have meta
  const wcOnlyMeta = Object.keys(state.wcMeta).filter(
    (k) => !state.selections[k] && hasMeta(state.wcMeta[k])
  );

  if (wcEntries.length === 0 && wcOnlyMeta.length === 0) {
    els.summaryPanel.hidden = true;
    return;
  }
  els.summaryPanel.hidden = false;
  els.summary.innerHTML = "";

  const allEntries = [
    ...wcEntries,
    ...wcOnlyMeta.map((k) => [k, {}]),
  ];

  for (const [wcKey, antiMap] of allEntries) {
    const wc = state.byKey.get(wcKey);
    if (!wc) continue;
    const row = document.createElement("div");
    row.className = "summary-row";
    const head = document.createElement("div");
    head.className = "wc";
    const wcLabel = labelFor(wcKey, state.wcVariants[wcKey]);
    const wcExtras = metaExtras(state.wcMeta[wcKey]);
    head.innerHTML = wcExtras
      ? `${escapeHtml(wcLabel)} <em>(${escapeHtml(wcExtras)})</em> →`
      : `${escapeHtml(wcLabel)} →`;
    const body = document.createElement("div");
    body.className = "antis";
    body.innerHTML = Object.entries(antiMap)
      .map(([k, flags]) => {
        const txt = labelFor(k, flags);
        const extra = metaExtras(flags);
        return extra
          ? `${escapeHtml(txt)} <em>(${escapeHtml(extra)})</em>`
          : escapeHtml(txt);
      })
      .join(", ");
    row.appendChild(head);
    if (Object.keys(antiMap).length > 0) row.appendChild(body);
    els.summary.appendChild(row);
  }
  els.output.value = buildOutputText(allEntries);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function labelFor(key, flags) {
  const name = nameOf(key);
  const tags = [];
  if (flags?.evo) tags.push("Evo");
  if (flags?.champ) tags.push("Kahraman");
  return tags.length ? `${name} [${tags.join(" + ")}]` : name;
}

function buildOutputText(entries) {
  const lines = ["Seeok — Anti listesi", "=".repeat(28), ""];
  for (const [wcKey, antiMap] of entries) {
    let head = `▸ ${labelFor(wcKey, state.wcVariants[wcKey])}`;
    const wcExtras = metaExtras(state.wcMeta[wcKey]);
    if (wcExtras) head += ` (${wcExtras})`;
    lines.push(head);
    for (const [k, flags] of Object.entries(antiMap)) {
      let line = `   - ${labelFor(k, flags)}`;
      const extra = metaExtras(flags);
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
  els.counter.textContent = `${n} kart için anti seçildi`;
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
  state.wcMeta = {};
  state.activeWc = null;
  state.editing = null;
  saveSelections();
  els.antiPanel.hidden = true;
  els.editDrawer.hidden = true;
  renderWcGrid();
  renderSummary();
}

init();
