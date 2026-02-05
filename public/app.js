const urlInput = document.getElementById("urlInput");
const parseButton = document.getElementById("parseButton");
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
