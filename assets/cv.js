/* cv.js — shared: profile store (repo defaults + browser-local sensitive fields), CV assembly, .docx export.
   NOTHING sensitive (name/phone/email/CTC) is stored in the repo; it lives in this browser's localStorage. */
(function () {
  const LS = {
    contact: "jsh.contact",
    screening: "jsh.screening",
    edits: "jsh.profileEdits",   // overrides to repo career data (summary, bullets…)
    statuses: "jsh.statuses",    // jobId -> status edits made on the tracker
  };

  const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  let repoProfile = null;
  async function loadRepoProfile() {
    if (repoProfile) return repoProfile;
    const r = await fetch("data/profile.json");
    repoProfile = await r.json();
    return repoProfile;
  }

  function getContact() {
    return read(LS.contact, { name: "", phone: "", email: "", linkedin: "", location: "Bangalore, India" });
  }
  function setContact(c) { write(LS.contact, c); }
  function getScreening() {
    return read(LS.screening, { notice_period: "", current_ctc: "", expected_ctc: "", why_looking: "" });
  }
  function setScreening(s) { write(LS.screening, s); }
  function getEdits() { return read(LS.edits, {}); }
  function setEdits(e) { write(LS.edits, e); }
  function getStatuses() { return read(LS.statuses, {}); }
  function setStatus(jobId, status) { const s = getStatuses(); s[jobId] = status; write(LS.statuses, s); }
  function hasLocalChanges() { return Object.keys(getStatuses()).length > 0; }

  /* Merge repo career data + local edits into one CV model. job (optional) triggers tailoring. */
  async function buildCvModel(job) {
    const base = await loadRepoProfile();
    const edits = getEdits();
    const contact = getContact();
    const variant = job && job.cv ? job.cv : {};

    const model = {
      name: contact.name || "YOUR NAME (fill on Profile page)",
      contact,
      contactIncomplete: !contact.name || !contact.phone || !contact.email,
      headline: variant.headline || edits.headline || base.headline_default,
      summary: variant.summary || edits.summary || base.summary,
      experience: JSON.parse(JSON.stringify(base.experience)),
      education: base.education,
      skills: base.skills,
      languages: base.languages,
      certifications: base.certifications,
      achievements: base.achievements,
      targetTitle: job ? job.title : "",
    };

    // apply local edits to experience bullets (keyed by company)
    if (edits.experience) {
      for (const e of model.experience) {
        if (edits.experience[e.company]) e.bullets = edits.experience[e.company].slice();
      }
    }
    // deterministic light tailoring when generated for a specific job:
    // 1) lead the headline with the target role family, 2) promote skills whose keywords appear in the title/notes
    if (job) {
      const hay = (job.title + " " + (job.notes || "")).toLowerCase();
      const kw = (s) => s.toLowerCase().split(/[^a-z]+/).some((w) => w.length > 3 && hay.includes(w));
      model.skills = model.skills.slice().sort((a, b) => (kw(b.category) ? 1 : 0) - (kw(a.category) ? 1 : 0));
      for (const e of model.experience) {
        e.bullets = e.bullets.slice().sort((a, b) => (kw(b) ? 1 : 0) - (kw(a) ? 1 : 0));
      }
    }
    return model;
  }

  /* ---------- .docx export (docx UMD from CDN) ---------- */
  async function ensureDocx() {
    if (window.docx) return window.docx;
    const urls = [
      "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js",
      "https://unpkg.com/docx@8.5.0/build/index.umd.js",
    ];
    for (const u of urls) {
      try {
        await new Promise((ok, err) => {
          const s = document.createElement("script");
          s.src = u; s.onload = ok; s.onerror = err;
          document.head.appendChild(s);
        });
        if (window.docx) return window.docx;
      } catch { /* try next */ }
    }
    throw new Error("Could not load the Word-file library (offline?). Use the PDF button instead.");
  }

  async function downloadDocx(job) {
    const d = await ensureDocx();
    const m = await buildCvModel(job);
    const F = "Arial";
    const C = { title: "1A2636", body: "2C3E50", sec: "5A6B7A", accent: "2980B9" };
    const run = (t, o = {}) => new d.TextRun({ text: t, size: o.size ?? 19, bold: o.bold, italics: o.italics, color: o.color ?? C.body, font: F });
    const P = (children, o = {}) => new d.Paragraph({ spacing: { line: 276, after: o.after ?? 40 }, ...o, children });
    const heading = (t) => P([run(t.toUpperCase(), { bold: true, size: 21, color: C.accent })], { spacing: { line: 276, before: 160, after: 60 }, border: { bottom: { style: d.BorderStyle.SINGLE, size: 4, color: C.accent, space: 2 } }, keepNext: true });
    const bullet = (t) => P([run("\u2022  " + t)], { spacing: { line: 276, after: 30 }, indent: { left: 260, hanging: 160 } });

    const contactLine = [m.contact.phone, m.contact.email, m.contact.linkedin, m.contact.location].filter(Boolean).join("  |  ");
    const children = [
      P([run(m.name.toUpperCase(), { size: 40, bold: true, color: C.title })], { alignment: d.AlignmentType.CENTER, after: 30 }),
      P([run(m.headline, { size: 20, color: C.sec })], { alignment: d.AlignmentType.CENTER, after: 30 }),
    ];
    if (contactLine) children.push(P([run(contactLine, { size: 18, color: C.sec })], { alignment: d.AlignmentType.CENTER, after: 80 }));
    if (m.contactIncomplete) children.push(P([run("⚠ Fill in phone / email on the Profile page before sending this CV.", { size: 18, color: "B3261E" })], { alignment: d.AlignmentType.CENTER, after: 60 }));

    children.push(heading("Professional Summary"), P([run(m.summary)]));
    children.push(heading("Core Skills"));
    for (const s of m.skills) children.push(bullet(s.category + ": " + s.items));
    children.push(heading("Work Experience"));
    for (const x of m.experience) {
      children.push(P([
        run(x.role, { bold: true, size: 21, color: C.title }),
        run("  —  " + x.company, { size: 19 }),
        run("\t" + x.dates, { size: 18, color: C.sec }),
      ], { tabStops: [{ type: d.TabStopType.RIGHT, position: 10300 }], keepNext: true, after: 30 }));
      for (const b of x.bullets) children.push(bullet(b));
      children.push(P([], { spacing: { after: 60 } }));
    }
    children.push(heading("Education"));
    for (const e of m.education) children.push(P([
      run(e.degree, { bold: true, size: 20 }),
      run("  —  " + e.school + " (" + e.note + ")", { size: 19 }),
      run("\t" + e.dates, { size: 18, color: C.sec }),
    ], { tabStops: [{ type: d.TabStopType.RIGHT, position: 10300 }], after: 30 }));
    children.push(heading("Certifications"));
    for (const c of m.certifications) children.push(bullet(c));
    children.push(heading("Achievements"));
    for (const a of m.achievements) children.push(bullet(a));
    if (m.languages) { children.push(heading("Languages"), P([run(m.languages)])); }

    const doc = new d.Document({
      styles: { default: { document: { run: { font: F, size: 19, color: C.body } } } },
      sections: [{ properties: { page: { margin: { top: 680, bottom: 560, left: 780, right: 780 } } }, children }],
    });
    const buf = await d.Packer.toBlob(doc);
    const fname = "CV-" + (job ? job.company.replace(/[^\w]+/g, "-") + "-" + job.title.replace(/[^\w]+/g, "-").slice(0, 40) : "Master") + ".docx";
    triggerDownload(buf, fname);
  }

  function triggerDownload(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  window.CV = {
    LS, read, write,
    loadRepoProfile, getContact, setContact, getScreening, setScreening,
    getEdits, setEdits, getStatuses, setStatus, hasLocalChanges,
    buildCvModel, downloadDocx, triggerDownload, toast,
  };

  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
  }
})();
