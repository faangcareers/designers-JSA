const statusEl = document.getElementById("status");
const warningsEl = document.getElementById("warnings");
const cardsEl = document.getElementById("cards");
const resultsCountEl = document.getElementById("resultsCount");

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
    card.className = "job-card";

    const watermark = document.createElement("div");
    watermark.className = "watermark";
    watermark.textContent = "HIRING";

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

    if (job.source_url) {
      const source = document.createElement("span");
      source.textContent = new URL(job.source_url).hostname;
      meta.appendChild(source);
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

async function loadAllJobs() {
  setStatus("Loading jobs...", "info");
  try {
    const res = await fetch("/api/jobs");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load jobs");
    clearStatus();
    setWarnings([]);
    renderCards(data.jobs || []);
  } catch (err) {
    setStatus(err.message || "Failed to load jobs", "error");
  }
}

loadAllJobs();
