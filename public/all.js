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

function formatBrand(job) {
  const raw = String(job.company || "").trim();
  const looksNoisy = raw.length > 40 || raw.includes("|") || raw.includes("?") || raw.includes("Careers");
  if (raw && !looksNoisy) return raw;

  try {
    const host = new URL(job.url).hostname.toLowerCase().replace(/^www\./, "");
    if (host.includes("spotify")) return "Spotify";
    if (host.includes("revolut")) return "Revolut";
    if (host.includes("greenhouse")) return "Greenhouse";
    const label = host.split(".")[0] || host;
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return "Unknown company";
  }
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

    const controls = document.createElement("div");
    controls.className = "job-controls";

    if (job.is_new) {
      const topBadge = document.createElement("span");
      topBadge.className = "job-badge";
      topBadge.textContent = "NEW";
      controls.appendChild(topBadge);
    }

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "icon job-remove";
    removeButton.setAttribute("aria-label", "Remove job");
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => removeJob(job.id));
    controls.appendChild(removeButton);

    const title = document.createElement("a");
    title.href = job.url;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.textContent = job.title || "Untitled role";
    title.className = "job-title";

    header.appendChild(title);
    header.appendChild(controls);

    const company = document.createElement("p");
    company.className = "job-company";
    company.textContent = formatBrand(job);

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
    link.className = "job-link";
    link.textContent = "View on Site";

    footer.appendChild(link);

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
