/* profile.js — master profile page: edit contact + screening answers + career content,
   completeness checklist, save to this browser, export/import full profile. */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const CHECKS = [
    ["name", "Full name on CV"], ["phone", "Phone number"], ["email", "Email"],
    ["linkedin", "LinkedIn URL"], ["notice_period", "Notice period"],
    ["current_ctc", "Current CTC"], ["expected_ctc", "Expected CTC"], ["why_looking", "Why looking (one-liner)"],
  ];

  function field(id, label, placeholder, required, hint) {
    return `<div class="field"><label>${esc(label)} ${required ? '<span class="req">*</span>' : ""}</label>
      <input id="${id}" placeholder="${esc(placeholder)}" ${required ? 'data-req="1"' : ""}>
      ${hint ? `<div class="hint">${esc(hint)}</div>` : ""}</div>`;
  }

  async function init() {
    const base = await CV.loadRepoProfile();
    const contact = CV.getContact();
    const scr = CV.getScreening();
    const edits = CV.getEdits();

    $("#contactForm").innerHTML = [
      field("p_name", "Full name (appears on CV)", "e.g. A. Candidate", true, "Stored only in this browser — never in the GitHub repo."),
      field("p_phone", "Phone", "+91 …", true),
      field("p_email", "Email", "you@example.com", true),
      field("p_linkedin", "LinkedIn", "linkedin.com/in/…", false),
      field("p_location", "Location", "Bangalore, India", false),
    ].join("");

    $("#screenForm").innerHTML = [
      field("p_notice", "Notice period", "e.g. 30 days / immediate", true, "Used to auto-fill application forms."),
      field("p_ctc", "Current CTC", "e.g. ₹X LPA", true),
      field("p_exp_ctc", "Expected CTC", "e.g. ₹Y–Z LPA", true),
      `<div class="field"><label>Why looking <span class="req">*</span></label>
       <textarea id="p_why" rows="3" data-req="1" placeholder="One honest, growth-framed line"></textarea></div>`,
    ].join("");

    $("#careerForm").innerHTML = `
      <div class="field"><label>CV headline</label><input id="p_headline" value="${esc(edits.headline || base.headline_default)}"></div>
      <div class="field"><label>Professional summary</label><textarea id="p_summary" rows="5">${esc(edits.summary || base.summary)}</textarea></div>
      <div class="field"><label>Skills (one per line — “Category: items”)</label>
        <textarea id="p_skills" rows="6">${esc(base.skills.map((s) => s.category + ": " + s.items).join("\\n"))}</textarea>
        <div class="hint">Career content here is seeded from the repo copy; edits live in this browser.</div></div>
      <div class="field"><label>Languages</label><input id="p_languages" value="${esc(base.languages)}"></div>`;

    const xp = $("#expForm");
    xp.innerHTML = base.experience.map((e, i) => `
      <div class="card" style="margin-bottom:12px">
        <div class="grid2">
          <div class="field"><label>Role</label><input data-x="role" data-i="${i}" value="${esc(e.role)}"></div>
          <div class="field"><label>Company + dates</label><input data-x="co" data-i="${i}" value="${esc(e.company)}  ·  ${esc(e.dates)}"></div>
        </div>
        <div class="field" style="margin-top:8px"><label>Bullets (one per line)</label>
          <textarea data-x="bullets" data-i="${i}" rows="7">${esc((edits.experience && edits.experience[e.company] ? edits.experience[e.company] : e.bullets).join("\\n"))}</textarea></div>
      </div>`).join("");

    // load saved values into inputs
    const set = (id, v) => { const n = $("#" + id); if (n && v) n.value = v; };
    set("p_name", contact.name); set("p_phone", contact.phone); set("p_email", contact.email);
    set("p_linkedin", contact.linkedin); set("p_location", contact.location || "Bangalore, India");
    set("p_notice", scr.notice_period); set("p_ctc", scr.current_ctc); set("p_exp_ctc", scr.expected_ctc); set("p_why", scr.why_looking);

    $("#saveBtn").addEventListener("click", save);
    $("#exportBtn").addEventListener("click", exportProfile);
    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", importProfile);
    document.querySelectorAll("#contactForm input, #screenForm input, #screenForm textarea").forEach((i) => i.addEventListener("input", refreshChecks));
    refreshChecks();
  }

  function gather() {
    const base = CV.read("jsh._base", null); // not used; kept simple
    return {
      contact: {
        name: val("p_name"), phone: val("p_phone"), email: val("p_email"),
        linkedin: val("p_linkedin"), location: val("p_location"),
      },
      screening: {
        notice_period: val("p_notice"), current_ctc: val("p_ctc"),
        expected_ctc: val("p_exp_ctc"), why_looking: val("p_why"),
      },
      edits: {
        headline: val("p_headline"), summary: val("p_summary"), languages: val("p_languages"),
        skills: $("#p_skills").value.split("\\n").map((s) => s.trim()).filter(Boolean)
          .map((s) => { const [c, ...r] = s.split(":"); return { category: c.trim(), items: r.join(":").trim() }; }),
        experience: (() => {
          const out = {}; document.querySelectorAll("[data-x]").forEach((n) => { if (n.dataset.x === "bullets") {
            const co = document.querySelector(`[data-x="co"][data-i="${n.dataset.i}"]`).value.split("·")[0].trim();
            out[co] = n.value.split("\\n").map((s) => s.trim()).filter(Boolean);
          } }); return out; })(),
      },
    };
  }
  const val = (id) => { const n = $("#" + id); return n ? n.value.trim() : ""; };

  function save() {
    const g = gather();
    CV.setContact(g.contact); CV.setScreening(g.screening); CV.setEdits(g.edits);
    document.querySelectorAll("[data-req]").forEach((n) => n.classList.toggle("missing", !n.value.trim()));
    refreshChecks();
    CV.toast("Profile saved (in this browser)");
  }

  function refreshChecks() {
    const vals = {
      name: val("p_name"), phone: val("p_phone"), email: val("p_email"), linkedin: val("p_linkedin"),
      notice_period: val("p_notice"), current_ctc: val("p_ctc"), expected_ctc: val("p_exp_ctc"), why_looking: val("p_why"),
    };
    const done = CHECKS.filter(([k]) => vals[k]).length;
    $("#progressbar").style.width = Math.round((done / CHECKS.length) * 100) + "%";
    $("#progresslabel").textContent = `${done}/${CHECKS.length} required details filled`;
    $("#checks").innerHTML = CHECKS.map(([k, label]) =>
      `<li><span class="${vals[k] ? "ok" : "no"}">${vals[k] ? "✓" : "✗"}</span> ${esc(label)}</li>`).join("");
    document.querySelectorAll("[data-req]").forEach((n) => n.classList.toggle("missing", !n.value.trim()));
  }

  async function exportProfile() {
    const g = gather();
    const base = await CV.loadRepoProfile();
    const full = { ...base, contact: g.contact, screening: g.screening, overrides: g.edits };
    CV.triggerDownload(new Blob([JSON.stringify(full, null, 2)], { type: "application/json" }), "master-profile.json");
    CV.toast("Profile exported — hand this to ZCode to sync the shared copy");
  }

  async function importProfile(ev) {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (j.contact) CV.setContact(j.contact);
      if (j.screening) CV.setScreening(j.screening);
      if (j.overrides || j.edits) CV.setEdits(j.overrides || j.edits);
      CV.toast("Profile imported — reloading");
      setTimeout(() => location.reload(), 700);
    } catch { CV.toast("That file isn't a valid profile export"); }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
