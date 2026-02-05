const urlInput = document.getElementById("urlInput");
const parseButton = document.getElementById("parseButton");
const statusEl = document.getElementById("status");
const warningsEl = document.getElementById("warnings");
const cardsEl = document.getElementById("cards");
const resultsCountEl = document.getElementById("resultsCount");
const themeToggle = document.getElementById("themeToggle");
const historyList = document.getElementById("historyList");
const clearHistoryButton = document.getElementById("clearHistory");

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
    card.className = "card";

    const title = document.createElement("a");
    title.href = job.url;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.textContent = job.title || "Untitled role";
    title.className = "card-title";

    const company = document.createElement("p");
    company.className = "card-company";
    company.textContent = job.company || "Unknown company";

    const meta = document.createElement("div");
    meta.className = "card-meta";

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

    const tags = document.createElement("div");
    tags.className = "card-tags";
    if (Array.isArray(job.tags)) {
      job.tags.forEach((tag) => {
        const pill = document.createElement("span");
        pill.textContent = tag;
        tags.appendChild(pill);
      });
    }

    card.appendChild(title);
    card.appendChild(company);
    if (meta.childNodes.length) card.appendChild(meta);
    if (tags.childNodes.length) card.appendChild(tags);

    fragment.appendChild(card);
  });

  cardsEl.appendChild(fragment);
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
    themeToggle.textContent = "Light mode";
  } else {
    root.removeAttribute("data-theme");
    themeToggle.textContent = "Dark mode";
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

    li.appendChild(link);
    li.appendChild(meta);
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

async function parseJobs() {
  const url = urlInput.value.trim();
  if (!url) {
    setStatus("Please enter a URL.", "error");
    return;
  }

  setStatus("Fetching and parsing jobs...", "info");
  setWarnings([]);
  renderCards([]);

  try {
    const res = await fetch("/api/parse", {
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
    renderCards(data.jobs);
    addToHistory(url);
  } catch (err) {
    setStatus(err.message || "Something went wrong.", "error");
  }
}

parseButton.addEventListener("click", parseJobs);
urlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    parseJobs();
  }
});

themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const next = isDark ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

initTheme();
renderHistory(loadHistory());

clearHistoryButton.addEventListener("click", () => {
  saveHistory([]);
  renderHistory([]);
});
