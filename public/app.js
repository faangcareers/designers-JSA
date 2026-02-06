const urlInput = document.getElementById("urlInput");
const parseButton = document.getElementById("parseButton");
const statusEl = document.getElementById("status");
const warningsEl = document.getElementById("warnings");
const cardsEl = document.getElementById("cards");
const resultsCountEl = document.getElementById("resultsCount");
const themeToggle = document.getElementById("themeToggle");
const historyList = document.getElementById("historyList");
const clearHistoryButton = document.getElementById("clearHistory");
const sourcesEl = document.getElementById("sources");
const toggleSourcesButton = document.getElementById("toggleSources");
const sourcesContentEl = document.getElementById("sourcesContent");
const filterNew = document.getElementById("filterNew");
const filterSource = document.getElementById("filterSource");

const THEME_KEY = "djsa-theme";
const HISTORY_KEY = "djsa-history";
const HISTORY_LIMIT = 20;

let sourcesCache = [];
let jobsCache = [];

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
    cardsEl.innerHTML = "<p class=\"empty\">No jobs found yet.</p>";
    resultsCountEl.textContent = "0 jobs";
    return;
  }

  resultsCountEl.textContent = `${jobs.length} job${jobs.length === 1 ? "" : "s"}`;

  const fragment = document.createDocumentFragment();
  jobs.forEach((job) => {
    const card = document.createElement("article");
    card.className = "card job-card";

    const header = document.createElement("div");
    header.className = "job-header";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "icon job-remove";
    removeButton.setAttribute("aria-label", "Remove job");
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => removeJob(job.id));

    const title = document.createElement("a");
    title.href = job.url;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.textContent = job.title || "Untitled role";
    title.className = "job-title";

    header.appendChild(title);
    header.appendChild(removeButton);

    const company = document.createElement("p");
    company.className = "job-company";
    company.textContent = job.company || "Unknown company";

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

    const footer = document.createElement("div");
    footer.className = "job-footer";

    const link = document.createElement("a");
    link.href = job.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "text-link";
    link.textContent = "Open";

    footer.appendChild(link);

    if (job.is_new) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "NEW";
      footer.appendChild(badge);
    }

    card.appendChild(header);
    card.appendChild(company);
    if (meta.childNodes.length) card.appendChild(meta);
    card.appendChild(footer);

    fragment.appendChild(card);
  });

  cardsEl.appendChild(fragment);
}

function applyTheme(theme) {
  const root = document.documentElement;
  const isDark = theme === "dark";
  if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
  themeToggle.checked = isDark;
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

function toggleTheme() {
  const next = themeToggle.checked ? "dark" : "light";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
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
    historyList.innerHTML = "<li class=\"empty\">No sources added yet.</li>";
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
    copyButton.className = "ghost";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(entry.url);
        copyButton.textContent = "Copied";
        setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 1200);
      } catch {
        copyButton.textContent = "Failed";
        setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 1200);
      }
    });

    const right = document.createElement("div");
    right.className = "history-actions";
    const pasteButton = document.createElement("button");
    pasteButton.type = "button";
    pasteButton.className = "ghost";
    pasteButton.textContent = "Paste";
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

async function removeJob(jobId) {
  const confirmed = window.confirm("Remove this job from tracking?");
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to remove job");
    jobsCache = jobsCache.filter((job) => job.id !== jobId);
    applyJobFilters();
    await loadSources();
  } catch (err) {
    setStatus(err.message || "Failed to remove job", "error");
  }
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
    }
  } catch (err) {
    setStatus(err.message || "Something went wrong.", "error");
  }
}

async function loadSources() {
  const res = await fetch("/api/sources");
  const data = await res.json();
  sourcesCache = data.sources || [];
  renderSources(sourcesCache);
  renderSourceFilter(sourcesCache);
}

async function loadJobs(sourceId) {
  setStatus("Loading jobs...", "info");
  const url = sourceId ? `/api/jobs?sourceId=${sourceId}` : "/api/jobs";
  const res = await fetch(url);
  const data = await res.json();
  clearStatus();
  jobsCache = data.jobs || [];
  applyJobFilters();
}

function renderSources(sources) {
  sourcesEl.innerHTML = "";
  if (!sources.length) {
    sourcesEl.innerHTML = "<p class=\"empty\">No sources added yet.</p>";
    return;
  }

  const fragment = document.createDocumentFragment();
  sources.forEach((source) => {
    const card = document.createElement("div");
    card.className = "card source-card";

    const url = document.createElement("div");
    url.className = "source-url";
    url.textContent = source.url;

    const meta = document.createElement("div");
    meta.className = "source-meta";
    meta.innerHTML = `Last checked: ${source.last_checked_at || "never"} · New: ${source.new_count || 0}`;

    const actions = document.createElement("div");
    actions.className = "source-actions";

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "ghost";
    viewBtn.textContent = "View jobs";
    viewBtn.addEventListener("click", () => {
      loadJobs(source.id);
    });

    const markBtn = document.createElement("button");
    markBtn.type = "button";
    markBtn.className = "ghost";
    markBtn.textContent = "Mark seen";
    markBtn.addEventListener("click", async () => {
      await fetch(`/api/sources/${source.id}/mark-seen`, { method: "POST" });
      await loadSources();
      await loadJobs(source.id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon";
    deleteBtn.setAttribute("aria-label", "Remove source");
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", async () => {
      await fetch(`/api/sources/${source.id}`, { method: "DELETE" });
      await loadSources();
      renderCards([]);
    });

    actions.appendChild(viewBtn);
    actions.appendChild(markBtn);
    actions.appendChild(deleteBtn);

    if (source.new_count > 0) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = `${source.new_count} NEW`;
      actions.prepend(badge);
    }

    card.appendChild(url);
    card.appendChild(meta);
    card.appendChild(actions);
    fragment.appendChild(card);
  });

  sourcesEl.appendChild(fragment);
}

function renderSourceFilter(sources) {
  const currentValue = filterSource.value;
  filterSource.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All sources";
  filterSource.appendChild(allOption);

  sources.forEach((source) => {
    const option = document.createElement("option");
    option.value = String(source.id);
    option.textContent = new URL(source.url).hostname;
    filterSource.appendChild(option);
  });

  filterSource.value = currentValue;
}

function applyJobFilters() {
  let filtered = [...jobsCache];
  if (filterNew.checked) {
    filtered = filtered.filter((job) => job.is_new);
  }
  renderCards(filtered);
}

parseButton.addEventListener("click", addSource);
urlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addSource();
  }
});

themeToggle.addEventListener("change", toggleTheme);
filterNew.addEventListener("change", applyJobFilters);
filterSource.addEventListener("change", () => {
  const sourceId = filterSource.value ? Number(filterSource.value) : null;
  loadJobs(sourceId);
});

initTheme();
renderHistory(loadHistory());
loadSources();

clearHistoryButton.addEventListener("click", () => {
  saveHistory([]);
  renderHistory([]);
});

toggleSourcesButton.addEventListener("click", () => {
  const collapsed = sourcesContentEl.classList.toggle("hidden");
  toggleSourcesButton.textContent = collapsed ? "Expand" : "Collapse";
});
