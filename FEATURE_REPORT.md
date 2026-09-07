# NuskhaSaathi — Complete Feature Report

**Alibaba Cloud AI Hackathon Pakistan 2026 · Healthcare Track**

*Verified against the codebase on 2026-09-07. Test counts and benchmark figures in this document were produced by running the suites, not estimated.*

---

## 0. At a glance

| | |
|---|---|
| **What it is** | An app that reads a photographed handwritten prescription and explains it aloud in Urdu |
| **Who it serves** | Low-literacy patients in Pakistan, elderly patients on multiple medicines, and their remote caregivers |
| **AI models** | `qwen-vl-plus` (vision/OCR) and `qwen-plus` (structuring, Urdu generation, Q&A) via Alibaba Cloud DashScope |
| **Application screens** | 9 |
| **HTTP endpoints** | 21 |
| **Automated tests** | 118 passing across 26 suites (~3.6s) |
| **Source size** | ~10,200 lines of JS/JSX (excluding dependencies) |
| **Runs without an API key** | Yes — demo mode returns identical response shapes |

---

## 1. The problem this addresses

A Pakistani prescription is written under time pressure: English drug names, Latin abbreviations (`BD`, `TDS`, `OD`, `SOS`, `nocte`), slash notation for duration (`5/7`), and handwriting intended for a pharmacist rather than a patient.

For a patient who cannot read English — a large share of the adult population — that paper carries no usable information. The consequences are ordinary and constant: the wrong frequency, a course abandoned when symptoms ease, a dose doubled when they don't, and two drugs that should never be combined taken together because two doctors never spoke.

**The framing that shapes every design decision here:** the prescription already exists, and the medicine is usually already affordable. The failure is not access. It is comprehension. Telemedicine connects a patient to a doctor; pharmacy apps deliver the box; both stop at the moment the paper changes hands, which is exactly where the harm begins.

---

## 2. Core pipeline — photograph to spoken Urdu

Four stages, of which exactly one is deliberately *not* a model.

```
Photo ──▶ [qwen-vl-plus]  ──▶ raw text
                              │
                              ▼
                         [qwen-plus]  ──▶ medicines + dosage + frequency
                              │                  + duration + confidence badge
                              ├──▶ [interaction table in code] ──▶ warnings
                              │
                              └──▶ [qwen-plus] ──▶ Urdu explanation ──▶ Web Speech
```

### 2.1 Stage 1 — OCR (`POST /upload`)
- Accepts jpg/png/webp up to 10 MB, with mobile camera capture supported directly from the browser.
- `qwen-vl-plus` extracts text from handwriting, handling mixed Urdu/English and clinical shorthand.
- Genuinely illegible words are returned as `[unclear]` rather than guessed.
- 30-second timeout with graceful failure; the raw OCR text is stored and viewable in a collapsible panel for transparency.

### 2.2 Stage 2 — Medicine structuring (`POST /identify-medicines`)
- `qwen-plus` converts raw text into a structured medicine list.
- Corrects plausible misreads (`Paracetmol` → `Paracetamol`).
- Extracts dosage, frequency, duration; expands shorthand into plain language.
- Assigns each medicine a `confident` or `uncertain` badge — enforced at the database level by a `CHECK` constraint.
- Ownership-checked: another user's `prescription_id` returns a 404 identical to a nonexistent one.

### 2.3 Stage 3 — Safety check (deterministic)
Runs in code, not through a model. See §4.

### 2.4 Stage 4 — Urdu instructions (`POST /instructions`)
- `qwen-plus` produces a simple, respectful Urdu explanation per medicine.
- Medicines and interaction flags are written inside a single transaction, rolled back on failure — a prescription is never half-saved.

### 2.5 Voice output
- Per-medicine 🔊 buttons plus a **Read All** sequence, stoppable at any point.
- Language switch between **اردو** and **English**, changeable mid-results.
- Smart voice matching: prefers an installed Urdu voice, falls back to Hindi, then default — and shows an amber notice when no Urdu voice exists on the device rather than silently reading Urdu text with an English voice.
- Deliberate pacing: 0.85× for Urdu, 0.95× for English.
- Race-condition protection via session tokens, so switching language or medicine mid-speech cancels cleanly and stale audio never plays.
- Speech cancels on unmount, so audio never bleeds across pages.

---

## 3. Feature inventory

### 3.1 Accounts and access
| Feature | Behavior |
|---|---|
| Signup | Name, email, password, optional age; duplicate email returns 409 |
| Login | JWT with 7-day expiry, persisted in `localStorage`, auto-restored on reload |
| Anti-enumeration | Wrong password and unknown email return an *identical* error |
| Forgot password | 32-byte crypto-random token, 1-hour expiry; unknown emails return 200 with a null token so accounts cannot be probed |
| Reset password | Single-use token, cleared from the database after use |
| Protected routing | Dashboard, Schedule and History redirect to login; the catch-all sends guests to the landing page |

### 3.2 Prescription handling
- Upload with instant preview and a three-stage live progress pipeline (OCR → identification → instructions).
- Prescription thumbnail displayed alongside results.
- Collapsible raw OCR viewer.
- Prominent red interaction banner above all other results when a dangerous pair is found.
- "Upload Another" reset with full speech cleanup.
- **History** (`GET /history`): every past prescription, newest first, with full medicine cards, warnings and OCR text — any instruction can be re-heard at any time.

### 3.3 Daily dose schedule (`GET /schedule`)
Turns a flat medicine list into the four times of day a patient actually recognizes — Morning / Afternoon / Evening / Night — each labelled in both English and Urdu (صبح، دوپہر، شام، رات).

- Frequency parsing covers `OD/QD`, `BD/BID`, `TDS/TID`, `QDS/QID`, "every 8 hours", and their plain-language equivalents.
- **A fifth slot exists on purpose:** anything whose timing cannot be read confidently lands in *As Needed / Confirm with Doctor* rather than being guessed into a time. Telling someone to take a medicine at a time the prescription never specified is precisely the failure this feature exists to avoid.
- A conditional medicine (`"BD as needed"`) is never scheduled — that frequency is a ceiling, not an instruction.
- **Refill window:** duration strings (`5 days`, `x 5 days`, `5/7`, `1 week`) are parsed into an approximate end date, flagging *ending soon* at ≤2 days. Vague durations ("as directed") produce silence rather than an invented end date.
- SQLite's `CURRENT_TIMESTAMP` is explicitly parsed as UTC, so the end date does not shift by a day for users east or west of UTC.

### 3.4 Patient correction (`PATCH /medicines/:id`)
The patient holding the paper is a better authority than the model's own hedge. Correcting or confirming a medicine promotes it to `confident`, and:

- **Re-runs the interaction check across the whole prescription** — a corrected name can create a dangerous pair that did not exist when the list was first read, or clear one based on a misread. Old flags are deleted and rewritten inside one transaction.
- **Clears the stale Urdu explanation.** A stored explanation describes the medicine *as it was read*; once the name or dosage changes it no longer matches, and reading it aloud would be worse than saying nothing. The UI says so. English read-aloud is unaffected, since it is built from the structured fields, which are now correct.
- Ownership enforced by joining through `prescriptions`, so another patient's medicine returns the same uniform 404.

### 3.5 Caregiver sharing (`/caregiver/*`)
- `GET /caregiver/token` issues a 24-byte secret token per patient, created on first request.
- `POST /caregiver/token/regenerate` invalidates the old link immediately — sharing is revocable.
- `GET /caregiver/view/:token` is a **public, no-login** endpoint returning the patient's name, most recent prescription, live dose schedule, medicines and interaction warnings.
- A unique database index guarantees token uniqueness.
- Purpose: a son in another city can see whether his mother's evening dose is due, without an account and without her password.

### 3.6 Cross-prescription interaction scan (`GET /history/cross-interactions`)
The distinctly Pakistani failure mode is three doctors who never spoke to each other. This endpoint scans **every active prescription in the patient's history together**, surfacing dangerous pairs that span separate prescriptions — the only place that class of harm is visible.

### 3.7 Documents and sharing
| Feature | Behavior |
|---|---|
| **Urdu PDF report** (`GET /report/:prescriptionId`) | Server-rendered with PDFKit, embedding **Noto Naskh Arabic** so Urdu renders correctly. Includes confidence badges, interaction warnings and dosing — a sheet for the fridge, readable by someone with no phone |
| **Doctor summary card** | Formatted medicine list with dosages, interaction risks and the caregiver link, copyable into WhatsApp or shown to the next doctor |

### 3.8 AI assistance features
All are ownership-checked, all fall back to canned responses without an API key.

| Feature | Endpoint | What it does |
|---|---|---|
| **AI Rehnuma** (Q&A) | `POST /instructions/ask` | Ask a question by voice or text — "before or after food?", "what if I miss a dose?" — and hear the answer in Urdu, grounded in *this* prescription's medicines. Four preset quick-questions in Urdu |
| **Voice assistant** | browser `SpeechRecognition` (`ur-PK`) | Spoken commands, with explicit handling for blocked-microphone and unclear-audio cases |
| **Diet & precautions** | `GET /instructions/diet-plan/:id` | What to avoid while on these specific medicines, in Urdu and English |
| **Generic alternatives** | `GET /instructions/alternatives/:id` | Same active ingredient at lower cost — because a course is often abandoned for price, not confusion |
| **Symptom triage** | `POST /instructions/triage` | Describe a new symptom; get told whether it is a known mild side effect or a reason to seek care immediately |
| **Pill scanner** | `POST /instructions/scan-pill` | Matches a described tablet against the prescription's medicine list |

---

## 4. Drug interaction safety engine

**Deliberately deterministic.** The one part of the system that must never hallucinate does not involve a model at all — it is a curated table in code.

15 well-documented dangerous pairs:

| Pair | Risk |
|---|---|
| Aspirin + Warfarin | Bleeding |
| Ibuprofen + Aspirin | Stomach irritation |
| Ibuprofen + Warfarin | Anticoagulant effect |
| Metformin + Alcohol | Lactic acidosis |
| Lisinopril + Potassium | Hyperkalemia |
| Simvastatin + Amiodarone | Rhabdomyolysis |
| Warfarin + Fluconazole | Bleeding |
| Digoxin + Amiodarone | Dose adjustment needed |
| Methotrexate + Ibuprofen | Toxicity |
| Ciprofloxacin + Theophylline | Toxicity |
| Clopidogrel + Omeprazole | Reduced effectiveness |
| Sildenafil + Nitroglycerin | Severe BP drop |
| MAO inhibitor + SSRI | Serotonin syndrome |
| Lithium + Ibuprofen | Toxicity |
| Amoxicillin + Methotrexate | Reduced excretion |

**Matching properties:** pairwise across all medicines, order-independent (`Aspirin+Warfarin` ≡ `Warfarin+Aspirin`), case-insensitive, and brand-aware (`Brufen + Disprin` resolves to `Ibuprofen + Aspirin`).

**Single source of truth:** `checkInteractions` is defined once in `routes/instructions.js` and imported by the correction and history routes, so there is exactly one definition of "dangerous pair" in the codebase.

Intentionally small and accurate rather than large and unreliable. Warnings are persisted per prescription and propagate into the caregiver view, the doctor summary card and the PDF.

---

## 5. Accuracy benchmark

`npm run benchmark` spawns the **real `server.js`** on a free port and drives the real HTTP routes — `/upload` → `/identify-medicines` → `/instructions` — exactly as the browser does. No pipeline code was re-implemented to make it measurable, so what it scores is what ships.

**Two safeguards against a meaningless score:**
1. It **refuses to run without `DASHSCOPE_API_KEY`** — demo mode would score near-perfectly and prove nothing.
2. It uses a throwaway SQLite file and deletes uploaded images, never touching the development database.

**Ground truth** was transcribed by reading the images directly, never by running the pipeline (which would be circular). The dataset includes fairness fields: `aliases` for clinically identical names (returning `Ibuprofen` where the paper says `Brufen` counts as *acceptable* but not *exact*, reported separately rather than blurred) and `frequency_alt` / `duration_alt` for defensible readings of ambiguous instructions.

### Results (2026-09-05, `qwen-vl-plus` + `qwen-plus`)

| Metric | Result |
|---|---|
| Medicines captured | 7 / 7 (100%) |
| Medicines invented | 0 |
| Name correct (exact) | 7 / 7 |
| Dosage / Frequency / Duration correct | 7 / 7 each |
| Confidently wrong reads | 0 |
| Interactions caught | 1 / 1 |
| False-alarm interactions | 0 |

A hallucinated dosage is penalised exactly as heavily as a dropped one, and "confidently wrong" is tracked as its own metric — the badge is audited, not assumed.

### Stated limitation

**The dataset holds 2 of the 12 intended cases, and both are clean, evenly-lit images in a near-print handwriting style.** They do **not** test the hard case this product exists for: genuinely messy doctor handwriting, poor lighting, skew, and Urdu script.

The 100% should be read as *"the pipeline handles legible prescriptions reliably"* — **not** as a general accuracy claim. Adding cases is data entry, not engineering: drop the image in `test-assets/`, append to `dataset.json`, rerun.

**The scorer is itself unit-tested.** `tests/benchmarkMetrics.test.js` feeds it deliberately wrong pipeline output and asserts each mistake lands in the right bucket — dropped medicines, inventions, wrong dosage, wrong frequency, hallucinated duration, missed interactions, false alarms, confidently-wrong reads. A benchmark that reports 100% is only worth reading if it can also report failure.

---

## 6. Test suite — 118 tests, 26 suites, all passing

```
$ cd backend && npm test
ℹ tests 118   ℹ suites 26   ℹ pass 118   ℹ fail 0   ℹ duration_ms 3623
```

| Area | Verifies |
|---|---|
| **Interaction checker** | Each of the 15 pairs triggers a warning; safe combinations trigger none; order irrelevant; case-insensitive; empty and single-medicine lists neither crash nor false-flag |
| **Auth** | Duplicate signup → 409; wrong password → 401 with an error identical to unknown email; JWT middleware rejects missing, malformed, wrong-secret and expired tokens |
| **Password reset** | Tokens are single-use; tokens older than 1 hour rejected without changing the password; token columns cleared after use; the old password stops working |
| **Ownership** | `/identify-medicines` and `/instructions` reject another user's `prescription_id` with a uniform 404 that leaks no existence information; rejected calls write no rows |
| **Schedule** | Frequency → slot mapping; PRN routed to *as needed*; duration parsing; refill windows; UTC timestamp handling; route-level auth and cross-user isolation |
| **Correction** | Field validation; stale explanation cleared; interaction re-check after a corrected name; ownership |
| **Caregiver** | Token issuance, regeneration invalidating the old link, public view access, invalid tokens rejected |
| **Benchmark metrics** | The scorer correctly buckets every category of deliberate failure |
| **Hackathon features** | Diet, alternatives, triage, Rehnuma Q&A endpoints |

**Isolation guarantees:** tests point the app at a throwaway temp SQLite database via `SQLITE_PATH` — the development database is never touched. Server-backed suites spawn the real `server.js` on a free port with a blanked `DASHSCOPE_API_KEY`, activating demo mode, so **zero live AI calls** are made. All rows are wiped between tests and the temp database is deleted afterwards.

---

## 7. Architecture

### 7.1 Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS (port 5174) |
| Backend | Node.js + Express (port 3001) |
| Database | SQLite via `better-sqlite3`, WAL mode, zero-config |
| Vision / OCR | `qwen-vl-plus` — Alibaba Cloud DashScope |
| Language | `qwen-plus` — Alibaba Cloud ModelStudio |
| Object storage | Alibaba Cloud OSS (adapter present, local fallback active) |
| Voice output | Web Speech API — on-device, no per-second billing |
| Voice input | Browser `SpeechRecognition` (`ur-PK`) |
| Auth | JWT (7-day) + bcrypt (10 salt rounds) |
| PDF | PDFKit + embedded Noto Naskh Arabic |
| Testing | Node.js built-in test runner (`node:test`) |

### 7.2 Database schema

| Table | Contents |
|---|---|
| `users` | id, name, email, password_hash, age, reset_token, reset_token_expiry, caregiver_token |
| `prescriptions` | id, user_id, image_url, raw_ocr_text, uploaded_at |
| `medicines` | id, prescription_id, name, dosage, frequency, duration, purpose_explanation, confidence |
| `interaction_flags` | id, prescription_id, medicine_a, medicine_b, warning_text |

Migrations are idempotent and run on every boot. A unique index enforces caregiver-token uniqueness.

### 7.3 API surface — 21 endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/` | — | Health check |
| GET | `/health/cloud` | — | Alibaba Cloud service status |
| POST | `/auth/signup` | — | Create account |
| POST | `/auth/login` | — | Authenticate |
| GET | `/auth/me` | JWT | Current user (never exposes the password hash) |
| POST | `/auth/forgot-password` | — | Issue reset token |
| POST | `/auth/reset-password` | — | Reset with single-use token |
| POST | `/upload` | JWT | Image → OCR → prescription |
| POST | `/identify-medicines` | JWT | Structure OCR text |
| POST | `/instructions` | JWT | Urdu instructions + interaction check |
| POST | `/instructions/ask` | JWT | AI Rehnuma Q&A |
| POST | `/instructions/scan-pill` | JWT | Pill identification |
| GET | `/instructions/diet-plan/:id` | JWT | Diet and precautions |
| GET | `/instructions/alternatives/:id` | JWT | Generic alternatives |
| POST | `/instructions/triage` | JWT | Symptom triage |
| GET | `/history` | JWT | All prescriptions |
| GET | `/history/cross-interactions` | JWT | Cross-prescription safety scan |
| GET | `/schedule` | JWT | Today's dose schedule |
| PATCH | `/medicines/:id` | JWT | Correct or confirm a medicine |
| GET | `/report/:prescriptionId` | JWT | Urdu PDF |
| GET | `/caregiver/token` | JWT | Get share token |
| POST | `/caregiver/token/regenerate` | JWT | Revoke and reissue |
| GET | `/caregiver/view/:token` | **public** | Caregiver dashboard |

### 7.4 Screens

`/` landing · `/login` · `/signup` · `/forgot-password` · `/reset-password` · `/dashboard` · `/schedule` · `/history` · `/caregiver/:token`

### 7.5 Security posture
- bcrypt password hashing (10 salt rounds); the hash is never returned by any endpoint.
- JWT middleware on every protected route.
- Per-user ownership checks on all prescription access, returning a **404 identical to nonexistent**, so responses never leak whether a prescription exists.
- Identical login errors for wrong password and unknown email.
- Reset tokens: crypto-random, 1-hour expiry, single-use, cleared after use.
- Caregiver tokens: 24-byte crypto-random, unique-indexed, revocable on demand.
- Image type validation and a 10 MB size limit, with dedicated 413/400 handlers.

### 7.6 Demo mode
With no `DASHSCOPE_API_KEY`, every AI endpoint returns realistic canned data in **identical response shapes**. The full UI is demonstrable with no key, no network and no cost — which is also what makes the test suite free of live AI calls.

---

## 8. Build status — honest accounting

### Working end to end
- Photo → OCR → structured medicines → Urdu explanation → spoken aloud
- Drug interaction engine across 15 verified pairs
- Cross-prescription interaction scanning
- Auth, password reset, ownership isolation
- Daily dose schedule with refill windows
- Patient correction with interaction re-check
- Caregiver share link — public, revocable
- Urdu PDF report and doctor summary card
- AI Rehnuma Q&A, diet coach, symptom triage, generic alternatives
- Prescription history with full replay

### Prototyped — UI shells over real API contracts
| Feature | Current state |
|---|---|
| Vitals & health trends chart | Sample data, not persisted |
| Nearby-pharmacy stock | Sample data |
| WhatsApp reminder delivery | UI flow only; no messaging integration |
| Adherence score and streak | Sample data in the caregiver view |
| Pill photo recognition | Accepts a text description; vision path not wired |
| Alibaba Cloud OSS upload | Adapter written, local storage active pending credentials |

Each of these is integration work rather than invention — but none of them should be presented as finished, and they are not.

---

## 9. Responsible AI design

- **Explains, never diagnoses.** The app describes a prescription a doctor already wrote. It does not recommend medicines, adjust doses, or offer a second opinion. This boundary is written into the model system prompts, not only the UI copy.
- **Honest uncertainty.** Confidence badges are surfaced to the patient with amber highlighting, and the benchmark measures whether the badge means anything.
- **Never guesses timing.** A medicine whose schedule cannot be read goes to *Confirm with Doctor*, not into a time slot.
- **Never guesses a dose.** A missing dosage prompts the patient to confirm with their doctor or pharmacist.
- **Safety is not generative.** Interaction warnings come from a reviewed table in code, so they can neither be invented nor missed by sampling.
- **Stale explanations are deleted, not reused.** After a correction the app says nothing rather than saying something outdated.
- Demo data uses clearly fictional patients only.

---

## 10. Running the project

```bash
# Install
cd backend  && npm install
cd ../frontend && npm install

# Optional: seed demo data (demo user + 2 sample prescriptions)
cd backend && npm run seed

# Test — 118 tests, no live AI calls
npm test

# Accuracy benchmark (requires DASHSCOPE_API_KEY)
npm run benchmark
npm run benchmark -- --runs 3        # show run-to-run variance

# Run
cd backend  && npm run dev     # port 3001
cd frontend && npm run dev     # port 5174
```

**Demo account:** `test@nuskhasaathi.com` / `demo123456`

### Environment (`backend/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `DASHSCOPE_API_KEY` | For real AI | Qwen-VL + Qwen access; absent → demo mode |
| `DASHSCOPE_BASE_URL` | Optional | Custom DashScope-compatible endpoint |
| `JWT_SECRET` | Yes | Token signing |
| `PORT` | Optional | Backend port (default 3001) |
| `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` / `OSS_BUCKET_NAME` / `OSS_REGION` | Optional | Alibaba Cloud OSS; absent → local storage |
| `SQLITE_PATH` | Tests only | Redirects the database to a temp file |

---

## 11. What comes next

1. **Expand the benchmark to all 12 intended cases** — messy handwriting, poor lighting, skew, Urdu script — and publish whatever number comes back, including if it is bad. This is the single highest-value next step, because it is the only claim in this document that is currently under-evidenced.
2. **Ship WhatsApp reminder delivery** — the channel Pakistani patients already use daily, and the one that turns a one-time reading into ongoing adherence.
3. **Pharmacist review of the interaction table** before it grows beyond 15 pairs. Size is not the goal; correctness is.
4. **Pilot with one clinic** to measure the outcome that actually matters: whether courses get finished.

---

*NuskhaSaathi · نسخہ ساتھی · Built for the Alibaba Cloud AI Hackathon Pakistan 2026*
