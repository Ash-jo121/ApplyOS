const state = { data: null, query: "", company: "", minScore: 0, newOnly: false };
const $ = (selector) => document.querySelector(selector);

function relativeTime(dateValue) {
  if (!dateValue) return "not run yet";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(dateValue).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function renderJobs() {
  const jobs = state.data.matches.filter((job) => {
    const haystack = `${job.title} ${job.company} ${job.location} ${job.reasons.join(" ")}`.toLowerCase();
    return (!state.query || haystack.includes(state.query)) && (!state.company || job.companyId === state.company) && job.score >= state.minScore && (!state.newOnly || job.isNew);
  });
  $("#jobs").innerHTML = jobs.map((job) => `
    <article class="job-card">
      <div>
        <div class="job-topline">${job.isNew ? '<span class="new-badge">NEW</span>' : ""}<span>${escapeHtml(job.company).toUpperCase()}</span><span>·</span><span>${escapeHtml(job.source).toUpperCase()}</span></div>
        <h3>${escapeHtml(job.title)}</h3>
        <div class="job-meta">${escapeHtml(job.location || "Location not stated")} ${job.postedAt ? `· Posted ${escapeHtml(relativeTime(job.postedAt))}` : ""}</div>
        <div class="reasons">${job.reasons.slice(0, 4).map((reason) => `<span class="reason">${escapeHtml(reason)}</span>`).join("")}</div>
      </div>
      <div class="job-action"><div class="score" title="Profile match score">${job.score}%</div><a class="view-link" href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(job.title)} at the job source">↗</a></div>
    </article>`).join("");
  $("#empty").hidden = jobs.length > 0;
}

function render(data) {
  state.data = data;
  const healthy = data.statuses.filter((source) => source.state === "healthy").length;
  const degraded = data.statuses.length - healthy;
  $("#match-count").textContent = data.matches.length;
  $("#new-count").textContent = data.matches.filter((job) => job.isNew).length;
  $("#health-count").textContent = `${healthy}/${data.statuses.length || 18}`;
  $("#last-scan").textContent = data.generatedAt ? new Date(data.generatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "not run yet";
  $("#scan-label").textContent = data.generatedAt ? `${degraded ? `${degraded} source${degraded === 1 ? "" : "s"} need attention` : "All systems watching"} · ${relativeTime(data.generatedAt)}` : "Waiting for first scan";
  $(".pulse").classList.toggle("degraded", degraded > 0);

  const options = [...data.statuses].sort((a, b) => a.company.localeCompare(b.company));
  $("#company-filter").innerHTML += options.map((source) => `<option value="${escapeHtml(source.companyId)}">${escapeHtml(source.company)}</option>`).join("");
  $("#companies").innerHTML = options.map((source) => `<article class="company" title="${escapeHtml(source.error || "Source healthy")}"><span class="status-dot ${source.state === "healthy" ? "ok" : "bad"}"></span><div><strong>${escapeHtml(source.company)}</strong><small>${escapeHtml(source.source)} · ${source.state}</small></div><span class="company-count">${source.matchesFound} match${source.matchesFound === 1 ? "" : "es"}</span></article>`).join("");

  for (const channel of ["email", "whatsapp"]) {
    const configured = data.notifications[`${channel}Configured`];
    $(`#${channel}-dot`).className = `status-dot ${configured ? "ok" : "bad"}`;
    $(`#${channel}-state`).textContent = configured ? "Ready for new matches" : "Credentials not configured";
  }
  renderJobs();
}

$("#search").addEventListener("input", (event) => { state.query = event.target.value.trim().toLowerCase(); renderJobs(); });
$("#company-filter").addEventListener("change", (event) => { state.company = event.target.value; renderJobs(); });
$("#score-filter").addEventListener("change", (event) => { state.minScore = Number(event.target.value); renderJobs(); });
$("#new-only").addEventListener("change", (event) => { state.newOnly = event.target.checked; renderJobs(); });

fetch(`./data/jobs.json?t=${Date.now()}`).then((response) => {
  if (!response.ok) throw new Error("Unable to load radar data");
  return response.json();
}).then(render).catch((error) => {
  $("#scan-label").textContent = error.message;
  $(".pulse").classList.add("degraded");
});
