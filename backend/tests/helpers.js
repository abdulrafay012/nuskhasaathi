// Shared harness for the NuskhaSaathi test suite.
//
// Each test file runs in its own node:test child process. Requiring this
// module points the app's SQLite file (via SQLITE_PATH, supported by
// config/db.js) at a throwaway temp database, so tests NEVER touch the real
// development database. Server-backed suites spawn the REAL server.js as a
// child process on a free port with a blanked DASHSCOPE_API_KEY, which
// activates the app's built-in demo mode — no live AI calls are ever made.
//
// Tests only READ and verify existing behavior. Fixtures insert rows
// directly (or through the real signup route); nothing here alters
// production code paths.

process.env.DASHSCOPE_API_KEY = ' '; // trims to '' → demo mode, no live API
process.env.DASHSCOPE_BASE_URL = 'http://127.0.0.1:9/v1'; // unreachable; never called in demo mode
process.env.JWT_SECRET = 'test-secret-for-the-nuskhasaathi-suite';

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const Database = require('better-sqlite3');

const TEST_DB_PATH = path.join(
  os.tmpdir(),
  `nuskhasaathi-test-${process.pid}-${Date.now()}.db`
);
process.env.SQLITE_PATH = TEST_DB_PATH;

// Same temp file, second connection: used for fixtures and row assertions.
// WAL mode (set by the app on boot) allows this cross-process access.
const rawDb = new Database(TEST_DB_PATH);
rawDb.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

let serverProcess = null;
let serverBaseUrl = null;
let serverReady = null;

function startServer() {
  if (serverReady) return serverReady;

  serverReady = (async () => {
    const port = await findFreePort();

    return new Promise((resolve, reject) => {
      serverProcess = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: {
          ...process.env,
          SQLITE_PATH: TEST_DB_PATH,
          PORT: String(port),
          DASHSCOPE_API_KEY: ' ',
          DASHSCOPE_BASE_URL: 'http://127.0.0.1:9/v1',
          JWT_SECRET: process.env.JWT_SECRET,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let settled = false;
      const settle = (fn, arg) => {
        if (settled) return;
        settled = true;
        clearTimeout(bootTimeout);
        fn(arg);
      };

      const onOutput = (chunk) => {
        const text = String(chunk);
        if (text.includes(`running on port ${port}`)) {
          serverBaseUrl = `http://127.0.0.1:${port}`;
          settle(resolve, serverBaseUrl);
        }
      };
      serverProcess.stdout.on('data', onOutput);
      serverProcess.stderr.on('data', onOutput);
      serverProcess.on('error', (err) => settle(reject, err));
      serverProcess.on('exit', (code) => {
        if (!settled) settle(reject, new Error(`Server exited early with code ${code}`));
      });

      const bootTimeout = setTimeout(
        () => settle(reject, new Error('Server did not boot within 20s')),
        20000
      );
    });
  })();

  return serverReady;
}

async function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
    serverBaseUrl = null;
    serverReady = null;
    // Give the OS a beat to release the file handle on Windows.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  try {
    rawDb.close();
  } catch {
    // already closed
  }

  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(TEST_DB_PATH + suffix, { force: true });
    } catch {
      // best-effort temp cleanup
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP client (no external dependencies)
// ---------------------------------------------------------------------------

async function request(method, urlPath, { body, token, headers = {} } = {}) {
  if (!serverBaseUrl) throw new Error('startServer() must run before request()');

  const finalHeaders = { ...headers };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  const response = await fetch(`${serverBaseUrl}${urlPath}`, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, data };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let uniqueCounter = 0;

function uniqueEmail(prefix = 'user') {
  uniqueCounter += 1;
  return `${prefix}-${Date.now()}-${uniqueCounter}@test.nuskhasaathi.pk`;
}

// Creates a real account through the actual signup route.
async function createUser({
  email = uniqueEmail(),
  password = 'password123',
  name = 'Test Patient',
  age = 45,
} = {}) {
  const res = await request('POST', '/auth/signup', {
    body: { name, email, password, age },
  });
  if (res.status !== 201) {
    throw new Error(`signup fixture failed (${res.status}): ${JSON.stringify(res.data)}`);
  }
  return { id: res.data.user.id, email, password, token: res.data.token, user: res.data.user };
}

// Inserts a prescription row directly — tests need the row, not the upload
// path (multer + AI OCR), which is exercised elsewhere.
function createPrescription(userId, { rawOcrText = 'Rx: Tab Panadol 500mg TDS x 5 days' } = {}) {
  const id = crypto.randomUUID();
  rawDb
    .prepare('INSERT INTO prescriptions (id, user_id, image_url, raw_ocr_text) VALUES (?, ?, ?, ?)')
    .run(id, userId, '/test-assets/prescription-sample-1.png', rawOcrText);
  return id;
}

function insertMedicines(prescriptionId, names) {
  const stmt = rawDb.prepare(
    `INSERT INTO medicines (id, prescription_id, name, dosage, frequency, duration, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  return names.map((name) => {
    const id = crypto.randomUUID();
    stmt.run(id, prescriptionId, name, '500mg', 'once a day', '5 days', 'confident');
    return { id, name };
  });
}

// Direct row insert for password-reset tests that need a pre-seeded token.
function insertUserDirect({
  email = uniqueEmail('direct'),
  passwordHash = 'not-a-real-hash',
  resetToken = null,
  resetTokenExpiry = null,
} = {}) {
  const id = crypto.randomUUID();
  rawDb
    .prepare(
      `INSERT INTO users (id, name, email, password_hash, reset_token, reset_token_expiry)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, 'Direct Insert', email, passwordHash, resetToken, resetTokenExpiry);
  return rawDb.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByEmail(email) {
  return rawDb.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function clearAllTables() {
  rawDb.exec(
    'DELETE FROM interaction_flags; DELETE FROM medicines; DELETE FROM prescriptions; DELETE FROM users;'
  );
}

module.exports = {
  startServer,
  stopServer,
  request,
  createUser,
  createPrescription,
  insertMedicines,
  insertUserDirect,
  getUserByEmail,
  clearAllTables,
  uniqueEmail,
  rawDb,
};
