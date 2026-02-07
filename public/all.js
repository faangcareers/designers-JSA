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

async function removeJob(jobId) {
  const confirmed = window.confirm("Remove this job from tracking?");
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to remove job");
    await loadAllJobs();
  } catch (err) {
    setStatus(err.message || "Failed to remove job", "error");
  }
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

    if (job.source_url) {
      const source = document.createElement("span");
      source.textContent = new URL(job.source_url).hostname;
      meta.appendChild(source);
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
