# NuskhaSaathi — Technical Specification & Build Guide
**Alibaba Cloud AI Hackathon Pakistan 2026 — Healthcare Track**

---

## 1. Project Summary

NuskhaSaathi lets a patient photograph a handwritten doctor's prescription and receive clear, spoken Urdu instructions — what each medicine is for, how and when to take it, and a warning if two prescribed medicines are known to interact dangerously. No literacy required, no new habit, just point, photograph, and listen.

**Core insight**: The prescription already exists on paper. The danger isn't lack of access to medicine — it's misreading what's already been prescribed.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React + Vite (or Next.js) | Reuse component patterns from QarzMitr if built alongside it |
| Styling | Tailwind CSS | Fast to build, clean for demo |
| Backend | Node.js + Express | Same stack as QarzMitr — share utilities if both projects run in parallel |
| Database | PostgreSQL (or SQLite for demo speed) | Stores prescriptions + medicine records |
| Auth | JWT-based email/password auth | Same pattern as QarzMitr — copy the module directly |
| Vision/OCR | Qwen-VL (Alibaba Model Studio) or Alibaba Cloud OCR | Reads handwritten prescription |
| LLM (structuring + explanation) | Qwen (Alibaba Model Studio, DashScope API) | Identifies medicines, generates Urdu instructions |
| Text-to-Speech | Web Speech API (`speechSynthesis`) in-browser | Free, no setup, works for live demo; use Urdu voice if available in browser, else read at slower pace in Roman Urdu/Urdu script |
| File storage | Alibaba Cloud OSS | Store uploaded prescription photos |
| Hosting | Alibaba Cloud ECS, or Vercel/Render for demo speed | |
| Dev tool | Qoder (AI coding assistant) | Use this spec as the master build reference |

### Required API keys / access
- Alibaba Cloud Model Studio (DashScope) API key — Qwen text + Qwen-VL vision
- Alibaba Cloud OSS access key + secret
- (Fallback if Alibaba access delayed) OpenAI API key — same prompt structure, swap endpoint only

---

## 3. Architecture Overview

```
[React Frontend]
   │  (upload prescription photo, hear instructions)
   ▼
[Express Backend API]
   │
   ├── /auth              → Authentication module
   ├── /upload             → Image upload → OSS storage
   ├── /ocr                 → Send image to Qwen-VL → raw text
   ├── /identify-medicines   → Send raw text to Qwen → structured medicine list
   ├── /instructions          → Generate Urdu instructions + interaction check
   └── /history                → Return user's past prescriptions
   │
   ▼
[PostgreSQL Database]
   users | prescriptions | medicines | interaction_flags
```

---

## 4. Database Schema

```sql
-- Users (reuse same structure as QarzMitr if sharing infrastructure)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  age INT,
  created_at TIMESTAMP DEFAULT now()
);

-- Prescriptions (raw photo + OCR text)
CREATE TABLE prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  image_url TEXT NOT NULL,
  raw_ocr_text TEXT,
  uploaded_at TIMESTAMP DEFAULT now()
);

-- Identified medicines (parsed from prescription text)
CREATE TABLE medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID REFERENCES prescriptions(id),
  name VARCHAR(150) NOT NULL,
  dosage VARCHAR(100),
  frequency VARCHAR(100),
  duration VARCHAR(100),
  purpose_explanation TEXT,
  confidence VARCHAR(20) CHECK (confidence IN ('confident','uncertain')),
  created_at TIMESTAMP DEFAULT now()
);

-- Interaction warnings (if two medicines on the same prescription conflict)
CREATE TABLE interaction_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID REFERENCES prescriptions(id),
  medicine_a VARCHAR(150),
  medicine_b VARCHAR(150),
  warning_text TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

---

## 5. Module Breakdown

### Module 1 — Authentication

**Purpose**: Secure signup/login so each patient's prescription history is private and persistent.

**Endpoints**:
- `POST /auth/signup` — name, email, password, age → creates user, returns JWT
- `POST /auth/login` — email, password → returns JWT
- `GET /auth/me` — returns current user profile (JWT-protected)

**Implementation notes**:
- Hash passwords with bcrypt
- JWT issued on login/signup; use middleware `verifyToken` on all protected routes
- This module is identical in structure to QarzMitr's — if building both projects, extract this into a shared reusable module rather than rewriting it

---

### Module 2 — Prescription Capture & OCR

**Purpose**: Convert a photo of a handwritten prescription into raw extracted text.

**Flow**:
1. User uploads prescription image
2. Backend uploads to Alibaba Cloud OSS, gets URL
3. Backend sends image to Qwen-VL with an OCR-focused prompt tuned for medical handwriting
4. Raw text saved to `prescriptions.raw_ocr_text`

**Endpoint**: `POST /upload` (multipart form, JWT-protected)

**AI Prompt (Qwen-VL, vision call)**:
```
System: You are an OCR assistant specialized in reading handwritten doctor prescriptions, which are often written quickly and in a mix of Urdu, English, and medical shorthand/abbreviations (e.g., "bd" = twice daily, "od" = once daily, "tds" = three times daily). Extract all visible text exactly as written, preserving line breaks. Do not interpret or translate yet — this step is extraction only. If a word is genuinely illegible, mark it as [unclear].

User: [image attached] Extract all text from this prescription.
```

**API call shape (Model Studio / DashScope, OpenAI-SDK compatible)**:
```javascript
const response = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${DASHSCOPE_API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "qwen-vl-plus",
    messages: [
      { role: "system", content: "You are an OCR assistant specialized in reading handwritten doctor prescriptions..." },
      { role: "user", content: [
          { type: "text", text: "Extract all text from this prescription." },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      }
    ]
  })
});
```

**Important build note**: This is the hardest module — doctor handwriting is genuinely difficult even for OCR. Budget the most testing time here. Collect 4-5 real or realistic sample prescriptions early and test against them repeatedly rather than discovering problems the night before the demo.

---

### Module 3 — Medicine Identification & Structuring

**Purpose**: Convert raw OCR text into a structured list of medicines with dosage/frequency, correcting likely OCR misreads against known medicine names.

**Flow**:
1. Backend sends `raw_ocr_text` to Qwen with a structuring + correction prompt
2. Model returns JSON array of medicines
3. Backend parses JSON, inserts rows into `medicines` table

**Endpoint**: `POST /identify-medicines` (triggered right after OCR)

**AI Prompt (Qwen, text call)**:
```
System: You are a medical assistant helping structure a handwritten prescription's raw OCR text into a clean list of medicines. You have general knowledge of common medicine names used in Pakistan (e.g., Panadol, Augmentin, Brufen, Disprin, Paracetamol, Amoxicillin).

For each medicine mentioned, output a JSON object with:
- "name": corrected medicine name (fix likely OCR misreads against common medicine names, e.g. "Paracetmol" → "Paracetamol")
- "dosage": e.g. "500mg" if mentioned, else null
- "frequency": plain description, e.g. "twice a day" (convert shorthand like "bd"/"od"/"tds")
- "duration": e.g. "5 days" if mentioned, else null
- "confidence": "confident" or "uncertain" — mark "uncertain" if the OCR text was unclear or the medicine name doesn't clearly match a known drug

Rules:
- Do not invent a medicine that isn't referenced in the text
- If truly unreadable, still include it with confidence "uncertain" and name as best guess, rather than silently dropping it
- Output ONLY a valid JSON array, no explanation, no markdown formatting

User: Here is the raw prescription text:
"""
{raw_ocr_text}
"""
```

**Why this matters for judges**: The `confidence` field is your safety mechanism — it shows you thought about what happens when the AI isn't sure, rather than presenting every output as equally certain. This is exactly the kind of detail that separates a thoughtful healthcare AI project from a naive one, and judges evaluating a healthcare-track project will care about this more than almost anything else.

---

### Module 4 — Instruction Generation & Interaction Check

**Purpose**: Generate simple spoken Urdu instructions per medicine, and flag dangerous interactions between medicines on the same prescription.

**Flow**:
1. Backend takes the structured medicine list
2. Backend checks each pair of medicines against a small hardcoded interaction reference table (you do NOT need a full clinical drug database for a hackathon demo — 10-15 well-known dangerous combinations is enough to demonstrate the concept)
3. Backend sends the medicine list to Qwen to generate plain-Urdu instructions per medicine
4. Any flagged interactions saved to `interaction_flags`, instructions saved to `medicines.purpose_explanation`

**Endpoint**: `POST /instructions`

**Example hardcoded interaction table (extend as time allows)**:
```javascript
const KNOWN_INTERACTIONS = [
  { a: "Aspirin", b: "Warfarin", warning: "Increased bleeding risk — consult your doctor before combining." },
  { a: "Ibuprofen", b: "Aspirin", warning: "Combined use may increase stomach irritation risk." },
  // add more well-documented, easily-verifiable pairs — keep the list small and accurate rather than large and unreliable
];
```

**AI Prompt (Qwen, text call — instruction generation)**:
```
System: You are a caring medical assistant explaining medicine instructions to a patient in simple, respectful Urdu. The patient may have low literacy, so avoid medical jargon. For each medicine, explain in 1-2 short sentences: what it is generally used for, and how/when to take it based on the dosage and frequency given. Do not give any medical advice beyond what is written on the prescription. If dosage or frequency is missing, say the patient should confirm with their doctor or pharmacist rather than guessing.

User: Here is the medicine list:
{medicine_list_json}

Generate the Urdu instructions for each medicine.
```

**Critical responsible-use note**: This module explains what a doctor already prescribed — it does not diagnose, does not recommend medicines, and does not override a doctor's instructions. Keep this framing explicit in your prompt design and in your pitch. This is the single most important thing to get right for a healthcare-track project, both ethically and for judge credibility — an AI that appears to give independent medical advice will worry judges, while one that clearly assists with understanding an existing prescription will not.

---

### Module 5 — History & UI (including Voice Output)

**Purpose**: Let a patient view and re-hear instructions for any past prescription.

**Endpoint**: `GET /history` (JWT-protected) — returns list of past prescriptions with their medicines and instructions

**Frontend components**:
- Upload button (photograph or select prescription image)
- Medicine cards: name, dosage, frequency, Urdu explanation, confidence indicator (small icon/color if "uncertain")
- Interaction warning banner (shown prominently if any flags exist)
- "Read aloud" button per medicine — uses Web Speech API `speechSynthesis` to read the Urdu instruction text
- History list of past prescriptions

**Voice implementation (Web Speech API, browser-native, no extra API needed)**:
```javascript
function speakInstruction(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ur-PK'; // fallback to default voice if unavailable
  utterance.rate = 0.85; // slightly slower for clarity
  window.speechSynthesis.speak(utterance);
}
```

---

## 6. Full API Endpoint List

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | /auth/signup | No | Create account |
| POST | /auth/login | No | Login, get JWT |
| GET | /auth/me | Yes | Get current user |
| POST | /upload | Yes | Upload prescription photo → OCR |
| POST | /identify-medicines | Yes | Structure OCR text into medicine list |
| POST | /instructions | Yes | Generate Urdu instructions + interaction check |
| GET | /history | Yes | Get user's past prescriptions |

---

## 7. Environment Variables

```
DASHSCOPE_API_KEY=
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_BUCKET_NAME=
DATABASE_URL=
JWT_SECRET=
PORT=3001
```
*(Use a different port than QarzMitr if running both projects locally at the same time.)*

---

## 8. Build Order (Recommended Sequence)

1. **Day 1 AM**: Auth module — copy/adapt directly from QarzMitr if both projects are being built in the same timeframe
2. **Day 1 Midday**: Upload + OCR module — test against 4-5 real/realistic prescription samples early, since this is the hardest module
3. **Day 1 PM**: Medicine identification/structuring module — verify the "confidence" flag behaves correctly on messy inputs
4. **Day 1 Evening**: Instruction generation + interaction check — build the small hardcoded interaction table, test the Urdu output reads naturally
5. **Day 2 AM**: Frontend — upload flow, medicine cards, voice playback
6. **Day 2 Midday**: Polish, error handling (garbled OCR, unreadable prescriptions — handle gracefully), prepare 2-3 clean demo prescription samples
7. **Day 2 PM**: Rehearse the live demo at least 3 times before presenting

---

## 9. Demo Script (for judges)

1. Introduce a real patient persona (elderly, low-literacy, rural — make it specific)
2. Upload a real handwritten prescription live on stage
3. Show OCR extracting the messy handwriting in real time
4. Show medicines being identified, including one "uncertain" flag to show honesty about limitations
5. Show the Urdu instructions generating, then press "Read Aloud" so judges hear the actual voice output
6. If your interaction table includes a matching pair, show the warning banner triggering live
7. Close with the differentiation line: "Telemedicine connects patients to a doctor. NuskhaSaathi makes sure what the doctor already prescribed is actually understood and followed safely — the step every telemedicine platform skips."

---

## 10. Things That Will Make Judges Trust This More

- **Explicit non-diagnostic framing**: this explains an existing prescription, it does not replace a doctor — say this clearly in your pitch, not just in the prompt
- **Confidence flagging**: showing "uncertain" cases live in the demo builds more trust than pretending every OCR result is perfect
- **Small, accurate interaction table over a large, unreliable one**: 10-15 well-verified dangerous pairs beats a sprawling list you can't stand behind if questioned
- **Real numbers**: keep the doctor-ratio stat (1:1300 vs WHO's 1:1000) visible on a slide

---

## 11. Responsible Use Note

Per the hackathon's tools access conditions, all Qoder credits and Alibaba Cloud resources should be used only for this project's development — batch test calls rather than looping unnecessarily against the live API, and no account sharing. Given this project touches health information, also be deliberate in the demo about using clearly fictional/sample patient data, not any real person's actual prescription or medical details.
