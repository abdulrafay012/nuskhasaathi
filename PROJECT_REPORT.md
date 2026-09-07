# NuskhaSaathi — Complete Functionality Report

**Alibaba Cloud AI Hackathon Pakistan 2026 — Healthcare Track**
*Last updated: includes automated test suite (46 passing tests)*

---

## 1. Project Overview

NuskhaSaathi lets patients photograph a handwritten doctor's prescription and receive clear, spoken instructions — what each medicine is for, how and when to take it, and warnings for dangerous drug interactions. No literacy required: point, photograph, and listen.

**Core insight:** The prescription already exists on paper. The danger isn't lack of access to medicine — it's misreading what's already been prescribed.

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS (port 5174) |
| Backend | Node.js + Express (port 3001) |
| Database | SQLite (better-sqlite3, WAL mode, zero-config) |
| AI Vision (OCR) | Qwen-VL Plus via DashScope |
| AI Text (structuring + Urdu) | Qwen Plus via DashScope |
| Voice Output | Web Speech API (browser-native, Urdu/English) |
| Auth | JWT (7-day tokens) + bcrypt password hashing |
| Testing | Node.js built-in test runner (`node:test`) — 46 tests |

---

## 2. User-Facing Functionalities

### 2.1 Public Landing Page (`/`)
- Hero section explaining the problem (unreadable prescriptions)
- 7 feature cards (photo upload, AI OCR, medicine identification, Urdu instructions, read-aloud, interaction warnings, history)
- Step-by-step "How it works" walkthrough
- Problem/Solution/Impact/Innovation/Feasibility pitch blocks
- Safety/disclaimer band and hackathon footer
- Call-to-action buttons to Login/Signup

### 2.2 Authentication System
| Feature | Details |
|---|---|
| Signup | Name, email, password, optional age — validated, duplicate-email protection (409) |
| Login | JWT issued (7-day expiry), persisted in localStorage; identical error for wrong password vs unknown email (anti-enumeration) |
| Protected routing | Dashboard/History redirect to login when unauthenticated; catch-all routes guests to the landing page |
| Forgot password | Generates a secure reset token (32-byte crypto random, 1-hour expiry); unknown emails get 200 + null token (no account enumeration) |
| Reset password | Token-validated password update (single-use tokens, min length 6); token cleared from DB after use |
| Session management | Auto-restore on page reload, logout clears storage |

### 2.3 Prescription Upload & AI Processing (Dashboard)
- **Image upload** with instant preview, mobile camera capture support, 10MB limit, jpg/png/webp validation
- **3-stage progress pipeline** with live status indicators:
  1. **OCR** — Qwen-VL reads handwriting (Urdu/English/medical shorthand like "bd", "tds", "od"), marks illegible words as `[unclear]`, 30s timeout with graceful failure
  2. **Medicine identification** — Qwen structures OCR text: corrects misreads ("Paracetmol" → "Paracetamol"), extracts dosage/frequency/duration, converts shorthand to plain language, flags each medicine as **confident** or **uncertain**
  3. **Instruction generation** — Qwen produces simple Urdu explanations per medicine; interaction check runs in parallel
- **Atomic DB writes** — medicines and interaction flags insert inside a single transaction (rollback on failure)
- **Collapsible raw OCR text viewer** for transparency
- **Interaction warning banner** — prominent red alert when dangerous pairs detected
- **Prescription thumbnail card** with the uploaded image alongside results
- **"Upload Another" reset** with full speech cleanup

### 2.4 Voice Output (Read Aloud)
- **Per-medicine read buttons** (🔊) with speaking-state animation
- **"Read All" button** — plays all instructions in sequence, stoppable anytime
- **Language selector** — Urdu (اردو) or English, switchable anytime mid-results
- **Smart voice matching** — finds best available system voice (Urdu → falls back to Hindi → default); shows an amber notice when no Urdu voice is installed
- **Speed tuning** — Urdu at 0.85x for clarity, English at 0.95x
- **Race-condition protection** — switching language or medicine mid-speech cancels cleanly; session tokens prevent stale audio
- **English speech generation** — builds natural sentences from structured data ("Take Panadol 500mg, three times a day, for 5 days.")
- **Cross-page safety** — speech cancels on unmount so audio never bleeds between pages

### 2.5 Medicine Cards
- Medicine name with **Confident** (green) / **Uncertain** (amber) badge — uncertain cards get amber highlighting
- Dosage, frequency, duration chips
- Urdu explanation block (RTL-aware rendering)
- Individual read-aloud button respecting the selected language

### 2.6 Prescription History (`/history`)
- All past prescriptions ordered newest-first
- Each entry: upload timestamp, medicine count, prescription thumbnail
- Full medicine cards + interaction warnings + OCR text — **re-hear any instruction anytime**
- Empty state with guidance

---

## 3. Backend API Endpoints

| Method | Route | Auth | Function |
|---|---|---|---|
| GET | `/` | No | Health check |
| POST | `/auth/signup` | No | Create account, return JWT |
| POST | `/auth/login` | No | Authenticate, return JWT |
| GET | `/auth/me` | JWT | Current user profile (never exposes password hash) |
| POST | `/auth/forgot-password` | No | Generate reset token (enumeration-safe) |
| POST | `/auth/reset-password` | No | Reset password with single-use token |
| POST | `/upload` | JWT | Upload image → Qwen-VL OCR → save prescription |
| POST | `/identify-medicines` | JWT | Structure OCR text into medicines (ownership-checked) |
| POST | `/instructions` | JWT | Urdu instructions + interaction check (ownership-checked) |
| GET | `/history` | JWT | All user prescriptions + medicines + warnings |

**Security details:**
- bcrypt hashing (salt rounds 10)
- JWT middleware on all protected routes
- Per-user ownership checks on prescription access — foreign prescriptions return **404 identical to nonexistent ones**, so responses never leak whether a prescription exists
- Image-type validation, 10MB file-size limit
- Login errors are identical for wrong-password and unknown-email cases

---

## 4. Drug Interaction Safety System

- **15 verified dangerous pairs** hardcoded (intentionally small + accurate over large + unreliable):
  - Aspirin + Warfarin (bleeding risk)
  - Ibuprofen + Aspirin (stomach irritation)
  - Ibuprofen + Warfarin (anticoagulant effect)
  - Metformin + Alcohol (lactic acidosis)
  - Lisinopril + Potassium (hyperkalemia)
  - Simvastatin + Amiodarone (rhabdomyolysis)
  - Warfarin + Fluconazole (bleeding risk)
  - Digoxin + Amiodarone (dose adjustment needed)
  - Methotrexate + Ibuprofen (toxicity risk)
  - Ciprofloxacin + Theophylline (toxicity risk)
  - Clopidogrel + Omeprazole (reduced effectiveness)
  - Sildenafil + Nitroglycerin (severe BP drop)
  - MAO Inhibitors + SSRI (serotonin syndrome)
  - Lithium + Ibuprofen (toxicity risk)
  - Amoxicillin + Methotrexate (excretion reduction)
- Pairwise checking of all medicines on each prescription (order-independent, case-insensitive)
- Warnings persisted per-prescription and displayed prominently

---

## 5. AI Pipeline Architecture

```
Photo → [Qwen-VL OCR] → raw text → [Qwen structuring] → medicines (with confidence)
                                        ↓
                          [Hardcoded interaction table] → warnings
                                        ↓
                          [Qwen Urdu generation] → spoken instructions
```

- **Real mode:** live DashScope calls using a dedicated workspace endpoint (configurable via `DASHSCOPE_BASE_URL`)
- **Demo mode (automatic fallback):** when no API key is set, the app serves realistic canned data with identical response shapes — the full UI works without any key
- Robust JSON parsing (handles markdown-wrapped LLM output), 30s API timeouts, graceful degradation

---

## 6. Automated Test Suite

**46 tests, 12 suites — all passing in ~2 seconds** (`npm test` from `backend/`)

Built on Node's built-in test runner (`node:test`), matching the QarzMitr sibling project's pattern. Tests only **read and verify** existing behavior — no route handlers, AI prompts, or queries were changed.

| Area | Tests | Verifies |
|---|---|---|
| **Drug interaction checker** | 24 | Each of the 15 dangerous pairs triggers a warning; safe combos (Panadol + Amoxicillin) trigger none; pair order irrelevant (Aspirin+Warfarin ≡ Warfarin+Aspirin); case-insensitive matching; empty and single-medicine lists don't crash or false-flag |
| **Auth logic** | 10 | Signup rejects duplicate emails (409); login rejects wrong password (401) with identical error for unknown email; JWT middleware rejects missing, malformed, wrong-secret, and expired tokens; fresh tokens accepted |
| **Password reset** | 6 | Tokens are single-use (second attempt fails); tokens older than 1 hour rejected without changing the password; token columns cleared in DB after successful reset; old password stops working after reset |
| **Ownership checks** | 6 | `/identify-medicines` and `/instructions` reject another user's prescription_id (uniform 404 — no existence leak); rejected calls write no rows; owners succeed (control cases) |

**Test isolation guarantees:**
- Tests point the app at a **throwaway temp SQLite database** (via `SQLITE_PATH`) — the real dev database is never touched
- Server-backed suites spawn the **real server.js** on a free port with a blanked `DASHSCOPE_API_KEY`, activating demo mode — **zero live AI calls**
- All rows wiped between tests; temp DB deleted after each suite

---

## 7. Database Schema (SQLite, auto-created on startup)

| Table | Contents |
|---|---|
| `users` | id, name, email, password_hash, age, reset_token, reset_token_expiry |
| `prescriptions` | id, user_id, image_url, raw_ocr_text, uploaded_at |
| `medicines` | id, prescription_id, name, dosage, frequency, duration, purpose_explanation, confidence |
| `interaction_flags` | id, prescription_id, medicine_a, medicine_b, warning_text |

- Idempotent startup migrations (safe on every boot)
- Seed script (`npm run seed`): demo user + 2 sample prescriptions (3 medicines / 4 medicines with 1 interaction warning)

---

## 8. Testing & Demo Assets

- **2 sample prescription images** in `test-assets/` (served via `/test-assets`)
- **Demo account:** `test@nuskhasaathi.com` / `demo123456`
- **Seeded history** showing confident + uncertain medicines and a live interaction warning — ideal for the hackathon demo script

---

## 9. Running the Project

```bash
# 1. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 2. (Optional) Seed demo data
npm run seed        # from backend/

# 3. Run the test suite
npm test            # from backend/ — 46 tests

# 4. Start backend (port 3001)
cd backend && npm run dev

# 5. Start frontend (port 5174 — 5173 is reserved for QarzMitr)
cd frontend && npm run dev
```

**Environment variables** (`backend/.env`):

| Variable | Required | Purpose |
|---|---|---|
| `DASHSCOPE_API_KEY` | For real AI | Qwen-VL + Qwen access (falls back to demo mode without it) |
| `DASHSCOPE_BASE_URL` | Optional | Custom DashScope-compatible endpoint |
| `JWT_SECRET` | Yes | Token signing |
| `PORT` | Optional | Backend port (default 3001) |
| `SQLITE_PATH` | Tests only | Redirects DB to temp file (unset in normal runs) |

---

## 10. Project Structure

```
NuskhaSaathi/
├── NuskhaSaathi_Project_Spec.md   # Original build spec
├── PROJECT_REPORT.md              # This report
├── README.md                      # Setup guide
├── test-assets/                   # 2 sample prescription images
│
├── backend/
│   ├── server.js                  # Express app entry point
│   ├── package.json               # start / dev / seed / test scripts
│   ├── config/
│   │   ├── db.js                  # SQLite connection (SQLITE_PATH-aware)
│   │   └── initDB.js              # Schema + migrations
│   ├── middleware/
│   │   └── auth.js                # JWT verification
│   ├── routes/
│   │   ├── auth.js                # Signup, login, me, forgot/reset password
│   │   ├── upload.js              # Image upload + Qwen-VL OCR
│   │   ├── identifyMedicines.js   # Medicine structuring (ownership-checked)
│   │   ├── instructions.js        # Urdu instructions + interaction check
│   │   └── history.js             # Past prescriptions
│   ├── scripts/
│   │   └── seed.js                # Demo data seeder
│   └── tests/
│       ├── helpers.js             # Test harness (temp DB, spawned server)
│       ├── interactions.test.js   # 24 interaction-checker tests
│       ├── auth.test.js           # 10 auth tests
│       ├── passwordReset.test.js  # 6 reset-token tests
│       └── ownership.test.js      # 6 ownership tests
│
└── frontend/
    ├── vite.config.js             # Port 5174, API proxy
    └── src/
        ├── App.jsx                # Routing + auth state
        ├── api.js                 # Axios API client
        ├── speech.js              # Urdu/English TTS engine
        ├── components/
        │   ├── Navbar.jsx
        │   ├── MedicineCard.jsx   # Medicine display + voice
        │   └── InteractionBanner.jsx
        └── pages/
            ├── Landing.jsx        # Public landing page
            ├── Login.jsx / Signup.jsx
            ├── ForgotPassword.jsx / ResetPassword.jsx
            ├── Dashboard.jsx      # Upload + results + voice controls
            └── History.jsx
```

---

## 11. Responsible AI Design

- Explains existing prescriptions only — never diagnoses or recommends medicines
- Explicit non-diagnostic framing in UI text and AI prompts
- Confidence flagging shows honesty about OCR limitations
- Missing dosage → prompts patient to confirm with doctor/pharmacist, never guesses
- Demo uses clearly fictional sample patient data only

---

## 12. Pitch Summary (60 seconds)

> Pakistan has roughly 1 doctor per 1,300 people — nearly double the WHO threshold. When a patient finally sees a doctor, the prescription is handwritten, often in rushed shorthand mixing Urdu and English. For a low-literacy patient, that paper might as well be blank.
>
> NuskhaSaathi closes that gap: photograph the prescription, and vision AI reads the handwriting; the medicine list is structured with dosages and honest confidence flags; each medicine gets a plain-Urdu explanation read aloud in a natural voice; and a curated table of 15 well-verified dangerous drug pairs raises an immediate warning if the prescription contains a risky combination.
>
> Telemedicine connects patients to a doctor. NuskhaSaathi makes sure what the doctor already prescribed is actually understood and followed safely — the step every telemedicine platform skips.
