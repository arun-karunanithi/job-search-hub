/* app.js — tracker home page: render jobs, per-column filters, sorting, inline status, CV downloads. */
(function () {
  let jobs = [], sortKey = "score", sortDir = -1, filtered = [];

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const daysAgo = (d) => Math.floor((Date.now() - new Date(d + "T00:00:00")) / 86400000);

  const COLS = [
    { key: "date_found", label: "Date Found", type: "date" },
    { key: "portal", label: "Portal", type: "select" },
    { key: "company", label: "Company", type: "text" },
    { key: "title", label: "Role Title", type: "text" },
    { key: "exp_req", label: "Exp Req", type: "select" },
    { key: "work_mode", label: "Work Mode", type: "select" },
    { key: "score", label: "Score", type: "range" },
    { key: "status", label: "Status", type: "select" },
    { key: "tailored_cv", label: "Tailored CV", type: "select" },
    { key: "notes", label: "Notes", type: "text" },
    // 'url' column rendered as Title link + actions; global search covers it
  ];
  const STATUSES = ["New", "Shortlisted", "Applied", "Interview", "Offer", "Rejected", "On Hold", "Closed"];

  function effectiveStatus(j) { return CV.getStatuses()[j.id] || j.status || "New"; }

  function renderFilters() {
    const box = $("#filters");
    box.innerHTML = "";
    for (const c of COLS) {
      const w = el("div");
      w.appendChild(el("label", null, esc(c.label)));
      let input;
      if (c.type === "select") {
        input = el("select");
        const vals = [...new Set(jobs.map((j) => String(j[c.key] || "")))].filter((v) => v !== "")
          .concat(c.key === "status" ? STATUSES : []).filter((v, i, a) => a.indexOf(v) === i).sort();
        input.innerHTML = '<option value="">All</option>' + vals.map((v) => `<option>${esc(v)}</option>`).join("");
        if (c.key === "status") input.innerHTML = '<option value="">All</option>' + STATUSES.map((v) => `<option>${esc(v)}</option>`).join("");
      } else if (c.type === "range") {
        input = el("input"); input.type = "number"; input.min = 0; input.max = 100; input.placeholder = "min";
        const input2 = el("input"); input2.type = "number"; input2.min = 0; input2.max = 100; input2.placeholder = "max";
        input.addEventListener("input", apply); input2.addEventListener("input", apply);
        w.appendChild(input); w.appendChild(el("div", null, "")).style.height = "4px"; w.appendChild(input2);
        input.dataset.f = c.key + "__min"; input2.dataset.f = c.key + "__max";
        box.appendChild(w); continue;
      } else if (c.type === "date") {
        input = el("input"); input.type = "date";
      } else {
        input = el("input"); input.type = "text"; input.placeholder = "contains…";
      }
      input.dataset.f = c.key;
      input.addEventListener("input", apply);
      w.appendChild(input);
      box.appendChild(w);
    }
  }

  function readFilters() {
    const f = {};
    document.querySelectorAll("#filters [data-f]").forEach((i) => (f[i.dataset.f] = i.value.trim().toLowerCase()));
    return f;
  }

  function apply() {
    const f = readFilters();
    const q = $("#globalSearch").value.trim().toLowerCase();
    filtered = jobs.filter((j) => {
      if (q && !JSON.stringify(j).toLowerCase().includes(q)) return false;
      for (const [k, v] of Object.entries(f)) {
        if (!v) continue;
        if (k.endsWith("__min")) { if ((j[k.slice(0, -5)] ?? 0) < +v) return false; }
        else if (k.endsWith("__max")) { if ((j[k.slice(0, -5)] ?? 100) > +v) return false; }
        else {
          let val = String(j[k] ?? "");
          if (k === "status") val = effectiveStatus(j);
          if (k === "tailored_cv" && !val) val = "Master";
          if (k === "date_found" && v) { if (val > f[k + "__max2"] && f[k + "__max2"]) return false; if (!val.toLowerCase().startsWith(v) && v.length < 10) return false; }
          else if (!val.toLowerCase().includes(v)) return false;
        }
      }
      return true;
    });
    renderRows();
  }

  function renderRows() {
    const tb = $("#tbody");
    tb.innerHTML = "";
    const edited = CV.getStatuses();
    const view = filtered.slice().sort((a, b) => {
      const va = sortKey === "status" ? effectiveStatus(a) : a[sortKey] ?? "";
      const vb = sortKey === "status" ? effectiveStatus(b) : b[sortKey] ?? "";
      const cmp = typeof va === "number" ? va - (vb ?? 0) : String(va).localeCompare(String(vb));
      return cmp * sortDir;
    });
    $("#count").textContent = `${view.length} of ${jobs.length} jobs`;
    for (const j of view) {
      const tr = el("tr", edited[j.id] && edited[j.id] !== j.status ? "row-edited" : "");
      const fresh = daysAgo(j.date_found) <= 3 ? '<span class="fresh">● new</span>' : "";
      const st = effectiveStatus(j);

      tr.innerHTML = `
        <td>${esc(j.date_found)}${fresh}</td>
        <td>${esc(j.portal)}</td>
        <td><b>${esc(j.company)}</b></td>
        <td class="title-cell"><b><a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.title)}</a></b>
            <span>${esc((j.exp_req || "exp n/a") + (j.work_mode && j.work_mode !== "unknown" ? " · " + j.work_mode : ""))}</span></td>
        <td>${esc(j.exp_req) || "—"}</td>
        <td>${esc(j.work_mode)}</td>
        <td class="score ${j.score >= 75 ? "score-high" : j.score >= 60 ? "score-mid" : "score-low"}">${j.score || 0}</td>
        <td><select class="cellstat">${STATUSES.map((s) => `<option ${s === st ? "selected" : ""}>${s}</option>`).join("")}</select></td>
        <td>${esc(j.cv ? "Tailored variant" : (j.tailored_cv || "Master"))}</td>
        <td class="note-cell">${esc(j.notes)}</td>
        <td class="actions">
          <button class="btn small" data-act="docx">Word CV</button>
          <button class="btn small" data-act="pdf">PDF CV</button>
        </td>`;
      tr.querySelector("select").addEventListener("change", (e) => {
        CV.setStatus(j.id, e.target.value);
        tr.classList.toggle("row-edited", e.target.value !== j.status);
        updateChip();
        CV.toast(`Saved “${j.company}” → ${e.target.value} (in this browser)`);
      });
      tr.querySelector('[data-act="docx"]').addEventListener("click", async (e) => {
        e.target.textContent = "…";
        try { await CV.downloadDocx(j); CV.toast("Word CV downloaded"); }
        catch (err) { CV.toast(err.message); }
        e.target.textContent = "Word CV";
      });
      tr.querySelector('[data-act="pdf"]').addEventListener("click", () => {
        window.open("cv.html?job=" + encodeURIComponent(j.id) + "&print=1", "_blank");
      });
      tb.appendChild(tr);
    }
  }

  function updateChip() {
    const n = Object.keys(CV.getStatuses()).length;
    const chip = $("#chip");
    chip.style.display = n ? "inline-flex" : "none";
    chip.querySelector("b").textContent = n;
  }

  async function init() {
    const r = await fetch("data/jobs.json");
    const data = await r.json();
    jobs = data.jobs.filter((j) => !String(j.company).startsWith("(browse")); // keep real listings on home view
    $("#generated").textContent = "last sweep: " + data.generated;
    const counts = {};
    jobs.forEach((j) => { const s = effectiveStatus(j); counts[s] = (counts[s] || 0) + 1; });
    $("#stats").innerHTML = `
      <div class="stat"><b>${jobs.length}</b><span>tracked</span></div>
      <div class="stat"><b>${counts.New || 0}</b><span>new</span></div>
      <div class="stat"><b>${counts.Shortlisted || 0}</b><span>shortlisted</span></div>
      <div class="stat"><b>${counts.Applied || 0}</b><span>applied</span></div>
      <div class="stat"><b>${counts.Interview || 0}</b><span>interview</span></div>
      <div class="stat"><b>${jobs.filter((j) => (j.score || 0) >= 75).length}</b><span>score ≥ 75</span></div>`;

    renderFilters();
    document.querySelectorAll("thead th").forEach((th) => {
      th.addEventListener("click", () => {
        const k = th.dataset.k;
        if (!k) return;
        sortDir = sortKey === k ? -sortDir : k === "score" ? -1 : 1;
        sortKey = k;
        document.querySelectorAll("thead th .arrow").forEach((a) => a.remove());
        th.insertAdjacentHTML("beforeend", ` <span class="arrow">${sortDir === 1 ? "▲" : "▼"}</span>`);
        renderRows();
      });
    });
    $("#globalSearch").addEventListener("input", apply);
    $("#exportEdits").addEventListener("click", () => {
      const edits = CV.getStatuses();
      if (!Object.keys(edits).length) return CV.toast("No status edits to export yet");
      CV.triggerDownload(new Blob([JSON.stringify({ status_edits: edits }, null, 2)], { type: "application/json" }), "status-edits.json");
      CV.toast("Downloaded — send this file/paste it to ZCode to sync back");
    });
    updateChip();
    apply();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
