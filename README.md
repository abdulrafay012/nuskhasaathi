# NuskhaSaathi — Your Prescription Assistant

**Alibaba Cloud AI Hackathon Pakistan 2026 — Healthcare Track**

NuskhaSaathi lets a patient photograph a handwritten doctor's prescription and receive clear, spoken Urdu instructions — what each medicine is for, how and when to take it, and a warning if two prescribed medicines are known to interact dangerously.

**No literacy required, no new habit — just point, photograph, and listen.**

---

## Key Features

- **OCR for Handwritten Prescriptions** — Uses Qwen-VL (Alibaba Cloud) to extract text from photos of handwritten prescriptions, handling Urdu, English, and medical shorthand
- **Medicine Identification** — AI structures raw OCR text into a clean medicine list with dosage, frequency, and confidence flagging
- **Urdu Voice Instructions** — Generates simple, respectful Urdu instructions per medicine and reads them aloud using Web Speech API
- **Drug Interaction Warnings** — Checks for dangerous medicine combinations from a curated reference table
- **Prescription History** — Persistent history so patients can re-hear instructions anytime
- **Responsible AI Design** — Explains existing prescriptions only; never diagnoses or replaces a doctor

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| Auth | JWT (bcrypt password hashing) |
| Vision/OCR | Qwen-VL (Alibaba DashScope API) |
| LLM | Qwen (Alibaba DashScope API) |
| Text-to-Speech | Web Speech API (browser-native) |
| File Storage | Local (Alibaba Cloud OSS-ready) |

---

## Project Structure

```
NuskhaSaathi/
├── backend/
│   ├── config/
│   │   ├── db.js              # PostgreSQL connection
│   │   └── initDB.js          # Schema initialization
│   ├── middleware/
│   │   └── auth.js            # JWT verification middleware
│   ├── routes/
│   │   ├── auth.js            # Signup, login, profile
│   │   ├── upload.js          # Image upload + Qwen-VL OCR
│   │   ├── identifyMedicines.js  # Medicine structuring
│   │   ├── instructions.js    # Urdu instructions + interaction check
│   │   └── history.js         # Past prescriptions
│   ├── server.js              # Express app entry point
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── App.jsx            # Routing + auth state
    │   ├── api.js             # Axios API client
    │   ├── components/
    │   │   ├── Navbar.jsx
    │   │   ├── MedicineCard.jsx    # Medicine display + voice
    │   │   └── InteractionBanner.jsx
    │   └── pages/
    │       ├── Login.jsx
    │       ├── Signup.jsx
    │       ├── Dashboard.jsx       # Upload + results
    │       └── History.jsx
    └── vite.config.js
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Alibaba Cloud DashScope API key (for Qwen-VL + Qwen)

### 1. Clone and Install

```bash
git clone <repo-url>
cd NuskhaSaathi

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Set Up Database

```bash
createdb nuskhasaathi
```

Or using psql:
```sql
CREATE DATABASE nuskhasaathi;
```

### 3. Configure Environment

Copy and edit the backend `.env`:

```bash
cd backend
cp .env.example .env
```

Fill in your values:

```
DASHSCOPE_API_KEY=your_dashscope_api_key
OSS_ACCESS_KEY_ID=        # Optional, for cloud storage
OSS_ACCESS_KEY_SECRET=    # Optional, for cloud storage
OSS_BUCKET_NAME=          # Optional, for cloud storage
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nuskhasaathi
JWT_SECRET=your_jwt_secret
PORT=3001
```

### 4. Run the Application

Start the backend (port 3001):
```bash
cd backend
npm run dev
```

Start the frontend (port 5173):
```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## API Endpoints

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

## Drug Interaction Table

The app includes a curated table of 15 well-verified dangerous drug pairs including:
- Aspirin + Warfarin
- Ibuprofen + Aspirin
- Methotrexate + Ibuprofen
- Sildenafil + Nitroglycerin
- And 11 more documented pairs

This is intentionally small and accurate rather than large and unreliable.

---

## Responsible Use

NuskhaSaathi **explains** an existing prescription — it does **not** diagnose, recommend medicines, or override a doctor's instructions. This framing is explicit in both the AI prompts and the user interface.

---

## License

Built for the Alibaba Cloud AI Hackathon Pakistan 2026.
