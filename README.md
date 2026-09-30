# Job Tracker

Personal job-application tracker (static site, no build step).

- `index.html` — the tracker: filters on every column, inline status dropdowns, per-job CV downloads (Word/PDF generated on-device).
- `profile.html` — master profile editor + completeness checklist; feeds the CV generator. Sensitive fields stay in the browser's local storage and are never committed here.
- `cv.html` — print-ready CV view (job-aware).
- `data/jobs.json` — tracker data, refreshed by an automated daily sweep.
- `data/profile.json` — non-sensitive career content used by the CV generator.
