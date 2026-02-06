const urlInput = document.getElementById("urlInput");
const parseButton = document.getElementById("parseButton");
const addSourceAlt = document.getElementById("addSourceAlt");
const statusEl = document.getElementById("status");
const warningsEl = document.getElementById("warnings");
const cardsEl = document.getElementById("cards");
const resultsCountEl = document.getElementById("resultsCount");
const themeToggle = document.getElementById("themeToggle");
const historyList = document.getElementById("historyList");
const clearHistoryButton = document.getElementById("clearHistory");
const sourcesEl = document.getElementById("sources");
const refreshAllButton = document.getElementById("refreshAll");
const toggleSourcesButton = document.getElementById("toggleSources");
const toggleHistoryButton = document.getElementById("toggleHistory");
const sourcesContentEl = document.getElementById("sourcesContent");
const historyContentEl = document.getElementById("historyContent");
const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
const tabPanels = Array.from(document.querySelectorAll("[data-panel]"));

const THEME_KEY = "djsa-theme";
const HISTORY_KEY = "djsa-history";
const HISTORY_LIMIT = 20;

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove("hidden");
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.className = "status hidden";
}

function setWarnings(warnings) {
  if (!warnings || warnings.length === 0) {
    warningsEl.className = "warnings hidden";
    warningsEl.innerHTML = "";
    return;
  }

  warningsEl.className = "warnings";
  warningsEl.innerHTML = warnings.map((w) => `<p>${w}</p>`).join("");
}

function renderCards(jobs) {
  cardsEl.innerHTML = "";
  if (!jobs || jobs.length === 0) {
    cardsEl.innerHTML = "<p class=\"empty\">No jobs found. Try another URL.</p>";
    resultsCountEl.textContent = "0 jobs";
    return;
  }

  resultsCountEl.textContent = `${jobs.length} job${jobs.length === 1 ? "" : "s"}`;

  const fragment = document.createDocumentFragment();
  jobs.forEach((job) => {
    const card = document.createElement("article");
    card.className = "job-card";

    const watermark = document.createElement("div");
    watermark.className = "watermark";
    watermark.textContent = "DESIGN";

    const header = document.createElement("div");
    header.className = "job-header";

    const company = document.createElement("span");
    company.className = "job-tag";
    company.textContent = (job.company || "Unknown company").toUpperCase();

    header.appendChild(company);

    if (job.is_new) {
      const badge = document.createElement("span");
      badge.className = "badge-new";
      badge.textContent = "NEW";
      header.appendChild(badge);
    }

    const title = document.createElement("h3");
    title.className = "job-title";
    title.textContent = job.title || "Untitled role";

    const meta = document.createElement("div");
    meta.className = "job-meta";

    if (job.location) {
      const location = document.createElement("span");
      location.textContent = job.location;
      meta.appendChild(location);
    }

    if (job.postedAt) {
      const posted = document.createElement("span");
      posted.textContent = job.postedAt;
      meta.appendChild(posted);
    }

    const actions = document.createElement("div");
    actions.className = "job-actions";

    const open = document.createElement("a");
    open.href = job.url;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.className = "outline-button";
    open.textContent = "OPEN LISTING →";

    actions.appendChild(open);

    card.appendChild(watermark);
    card.appendChild(header);
    card.appendChild(title);
    if (meta.childNodes.length) card.appendChild(meta);
    card.appendChild(actions);

    fragment.appendChild(card);
  });

  cardsEl.appendChild(fragment);
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
    themeToggle.textContent = "LIGHT MODE";
  } else {
    root.removeAttribute("data-theme");
    themeToggle.textContent = "DARK MODE";
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    applyTheme(saved);
    return;
  }

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

function renderHistory(items) {
  historyList.innerHTML = "";
  if (!items.length) {
    historyList.innerHTML = "<li class=\"empty\">No history yet.</li>";
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((entry) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = entry.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = entry.url;

    const meta = document.createElement("span");
    meta.className = "history-meta";
    meta.textContent = entry.date;

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "chip";
    copyButton.textContent = "COPY";
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(entry.url);
        copyButton.textContent = "COPIED";
        setTimeout(() => {
          copyButton.textContent = "COPY";
        }, 1200);
      } catch {
        copyButton.textContent = "FAILED";
        setTimeout(() => {
          copyButton.textContent = "COPY";
        }, 1200);
      }
    });

    const right = document.createElement("div");
    right.className = "history-actions";
    const pasteButton = document.createElement("button");
    pasteButton.type = "button";
    pasteButton.className = "chip";
    pasteButton.textContent = "PASTE";
    pasteButton.addEventListener("click", () => {
      urlInput.value = entry.url;
      urlInput.focus();
    });

    right.appendChild(copyButton);
    right.appendChild(pasteButton);
    right.appendChild(meta);

    li.appendChild(link);
    li.appendChild(right);
    fragment.appendChild(li);
  });

  historyList.appendChild(fragment);
}

function addToHistory(url) {
  const items = loadHistory();
  const existingIndex = items.findIndex((item) => item.url === url);
  if (existingIndex >= 0) {
    items.splice(existingIndex, 1);
  }
  items.unshift({
    url,
    date: new Date().toLocaleString(),
  });
  const trimmed = items.slice(0, HISTORY_LIMIT);
  saveHistory(trimmed);
  renderHistory(trimmed);
}

async function addSource() {
  const url = urlInput.value.trim();
  if (!url) {
    setStatus("Please enter a URL.", "error");
    return;
  }

  setStatus("Adding source and parsing jobs...", "info");
  setWarnings([]);
  renderCards([]);

  try {
    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to parse jobs");
    }

    clearStatus();
    setWarnings(data.warnings);
    addToHistory(url);
    await loadSources();
    if (data.source?.id) {
      await loadJobs(data.source.id);
      setActiveTab("jobs");
    }
  } catch (err) {
    setStatus(err.message || "Something went wrong.", "error");
  }
}

async function loadSources() {
  const res = await fetch("/api/sources");
  const data = await res.json();
  renderSources(data.sources || []);
}

async function loadJobs(sourceId) {
  const res = await fetch(`/api/jobs?sourceId=${sourceId}`);
  const data = await res.json();
  renderCards(data.jobs || []);
}

async function refreshAll() {
  setStatus("Refreshing all sources...", "info");
  try {
    const res = await fetch("/api/refresh", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Refresh failed");
    clearStatus();
    await loadSources();
  } catch (err) {
    setStatus(err.message || "Refresh failed", "error");
  }
}

function renderSources(sources) {
  sourcesEl.innerHTML = "";
  if (!sources.length) {
    sourcesEl.innerHTML = "<p class=\"empty\">No sources yet.</p>";
    return;
  }

  const fragment = document.createDocumentFragment();
  sources.forEach((source) => {
    const card = document.createElement("div");
    card.className = "source-card";

    const head = document.createElement("div");
    head.className = "source-head";

    const url = document.createElement("div");
    url.className = "source-url";
    url.textContent = source.url;

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-button";
    deleteBtn.setAttribute("aria-label", "Remove source");
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", async () => {
      await fetch(`/api/sources/${source.id}`, { method: "DELETE" });
      await loadSources();
      renderCards([]);
    });

    head.appendChild(url);
    head.appendChild(deleteBtn);

    const tags = document.createElement("div");
    tags.className = "source-tags";

    const lastChecked = document.createElement("span");
    lastChecked.textContent = `LAST CHECKED: ${source.last_checked_at || "NEVER"}`;

    const newJobs = document.createElement("span");
    newJobs.textContent = `NEW JOBS: ${source.new_count || 0}`;

    const total = document.createElement("span");
    total.textContent = `TOTAL: ${source.total_count || 0}`;

    const status = document.createElement("span");
    status.textContent = source.new_count > 0 ? "STATUS: NEW" : "STATUS: TRACKING";

    tags.appendChild(lastChecked);
    tags.appendChild(newJobs);
    tags.appendChild(total);
    tags.appendChild(status);

    const actions = document.createElement("div");
    actions.className = "source-actions";

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "chip";
    viewBtn.textContent = "VIEW JOBS";
    viewBtn.addEventListener("click", () => {
      loadJobs(source.id);
      setActiveTab("jobs");
    });

    const markBtn = document.createElement("button");
    markBtn.type = "button";
    markBtn.className = "chip";
    markBtn.textContent = "MARK SEEN";
    markBtn.addEventListener("click", async () => {
      await fetch(`/api/sources/${source.id}/mark-seen`, { method: "POST" });
      await loadSources();
      await loadJobs(source.id);
    });

    actions.appendChild(viewBtn);
    actions.appendChild(markBtn);

    card.appendChild(head);
    card.appendChild(tags);
    card.appendChild(actions);

    fragment.appendChild(card);
  });

  sourcesEl.appendChild(fragment);
}

function setActiveTab(tabId) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabId;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.panel === tabId;
    panel.classList.toggle("hidden", !isActive);
  });
}

function initTabs() {
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });
}

parseButton.addEventListener("click", addSource);
addSourceAlt.addEventListener("click", addSource);
urlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addSource();
  }
});

themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const next = isDark ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

initTheme();
initTabs();
renderHistory(loadHistory());
loadSources();

clearHistoryButton.addEventListener("click", () => {
  saveHistory([]);
  renderHistory([]);
});

refreshAllButton.addEventListener("click", refreshAll);

function toggleSection(contentEl, buttonEl) {
  const collapsed = contentEl.classList.toggle("hidden");
  buttonEl.textContent = collapsed ? "EXPAND" : "COLLAPSE";
}

toggleSourcesButton.addEventListener("click", () => {
  toggleSection(sourcesContentEl, toggleSourcesButton);
});

toggleHistoryButton.addEventListener("click", () => {
  toggleSection(historyContentEl, toggleHistoryButton);
});
