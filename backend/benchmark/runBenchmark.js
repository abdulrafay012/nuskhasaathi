#!/usr/bin/env node
//
// NuskhaSaathi accuracy benchmark.
//
// Drives the REAL pipeline end-to-end over HTTP — upload -> OCR -> identify
// -> instructions — against hand-transcribed ground truth, and reports how
// often it reads a prescription correctly.
//
// Deliberate design choices:
//   * It talks to the running routes, so no pipeline code had to be changed
//     or re-implemented to make it measurable.
//   * It spawns its own server on a free port with a throwaway SQLite file,
//     so a benchmark run never touches the development database.
//   * It REFUSES to run without a live DASHSCOPE_API_KEY. The app falls back
//     to canned demo data when the key is missing, which would score near
//     100% and mean nothing.
//
// Usage:
//   npm run benchmark                 # all cases, 1 run
//   npm run benchmark -- --runs 3     # repeat to show variance
//   npm run benchmark -- --case rx-002-karachi

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { scoreCase, aggregate } = require('./lib/metrics');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const BACKEND_ROOT = path.join(__dirname, '..');
const RESULTS_DIR = path.join(__dirname, 'results');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { runs: 1, case: null, keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--runs') options.runs = Number(argv[++i]) || 1;
    else if (arg === '--case') options.case = argv[++i];
    else if (arg === '--keep-uploads') options.keep = true;
  }
  return options;
}

// ---------------------------------------------------------------------------
// Server lifecycle (same approach as tests/helpers.js, but with the live key)
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

async function startServer(dbPath) {
  const port = await findFreePort();

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: BACKEND_ROOT,
      env: {
        ...process.env,
        SQLITE_PATH: dbPath,
        PORT: String(port),
        JWT_SECRET: process.env.JWT_SECRET || 'benchmark-secret',
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
      if (String(chunk).includes(`running on port ${port}`)) {
        settle(resolve, { child, baseUrl: `http://127.0.0.1:${port}` });
      }
    };

    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
    child.on('error', (err) => settle(reject, err));
    child.on('exit', (code) => {
      if (!settled) settle(reject, new Error(`Server exited early with code ${code}`));
    });

    const bootTimeout = setTimeout(
      () => settle(reject, new Error('Server did not boot within 20s')),
      20000
    );
  });
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function requestJson(baseUrl, method, urlPath, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
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

async function uploadImage(baseUrl, token, imagePath) {
  const buffer = fs.readFileSync(imagePath);
  const extension = path.extname(imagePath).slice(1).toLowerCase();
  const mime = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';

  const form = new FormData();
  form.append('prescription', new Blob([buffer], { type: mime }), path.basename(imagePath));

  const response = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
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
// One case through the real pipeline
// ---------------------------------------------------------------------------

async function runCase(baseUrl, token, testCase) {
  const imagePath = path.join(PROJECT_ROOT, testCase.image);
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found for case ${testCase.id}: ${imagePath}`);
  }

  const started = Date.now();

  const uploaded = await uploadImage(baseUrl, token, imagePath);
  if (uploaded.status !== 200) {
    throw new Error(`upload failed (${uploaded.status}): ${JSON.stringify(uploaded.data)}`);
  }
  const prescriptionId = uploaded.data.prescription.id;
  const rawOcrText = uploaded.data.prescription.raw_ocr_text;

  const identified = await requestJson(baseUrl, 'POST', '/identify-medicines', {
    token,
    body: { prescription_id: prescriptionId },
  });
  if (identified.status !== 200) {
    throw new Error(`identify failed (${identified.status}): ${JSON.stringify(identified.data)}`);
  }

  const instructed = await requestJson(baseUrl, 'POST', '/instructions', {
    token,
    body: { prescription_id: prescriptionId },
  });
  if (instructed.status !== 200) {
    throw new Error(`instructions failed (${instructed.status}): ${JSON.stringify(instructed.data)}`);
  }

  return {
    prescription_id: prescriptionId,
    image_url: uploaded.data.prescription.image_url,
    raw_ocr_text: rawOcrText,
    medicines: instructed.data.medicines || [],
    interaction_warnings: instructed.data.interaction_warnings || [],
    urdu_instruction_coverage: (instructed.data.medicines || []).filter(
      (medicine) => Boolean(medicine.purpose_explanation)
    ).length,
    elapsed_ms: Date.now() - started,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const percent = (value) => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`);

function printCaseReport(score, prediction) {
  console.log(`\n  ── ${score.case_id} ${'─'.repeat(Math.max(0, 46 - score.case_id.length))}`);
  console.log(
    `     medicines: ${score.medicines.matched}/${score.medicines.expected} captured` +
      `   invented: ${score.medicines.invented}` +
      `   ${prediction.elapsed_ms}ms`
  );
  if (score.medicines.missed_names.length > 0) {
    console.log(`     MISSED:   ${score.medicines.missed_names.join(', ')}`);
  }
  if (score.medicines.invented_names.length > 0) {
    console.log(`     INVENTED: ${score.medicines.invented_names.join(', ')}`);
  }

  for (const detail of score.details) {
    const marks = [
      detail.name_acceptable ? 'name' : 'NAME',
      detail.dosage.correct ? 'dose' : 'DOSE',
      detail.frequency.correct ? 'freq' : 'FREQ',
      detail.duration.correct ? 'dur' : 'DUR',
    ].join(' ');
    const flag = detail.fully_correct ? ' ' : '!';
    console.log(
      `     ${flag} ${String(detail.predicted).padEnd(16)} ${String(detail.confidence).padEnd(10)} ${marks}` +
        (detail.name_exact ? '' : `   (truth: ${detail.expected})`)
    );
  }

  const { interactions } = score;
  console.log(
    `     interactions: expected ${interactions.expected}, flagged ${interactions.predicted}` +
      `, hit ${interactions.true_positive}, missed ${interactions.false_negative}` +
      `, false alarm ${interactions.false_positive}`
  );
  if (interactions.false_negative_pairs.length > 0) {
    console.log(`     MISSED INTERACTION: ${interactions.false_negative_pairs.join('; ')}`);
  }
  if (interactions.false_positive_pairs.length > 0) {
    console.log(`     FALSE ALARM: ${interactions.false_positive_pairs.join('; ')}`);
  }
}

function printSummary(summary) {
  const { rates, medicines, confidence, interactions } = summary;
  const row = (label, value, detail) =>
    console.log(`  ${label.padEnd(34)} ${String(value).padStart(7)}   ${detail || ''}`);

  console.log('\n' + '='.repeat(74));
  console.log('  SUMMARY');
  console.log('='.repeat(74));
  console.log('\n  READING THE PRESCRIPTION');
  row('Medicines captured', percent(rates.capture_rate), `${medicines.matched}/${medicines.expected}`);
  row('Name correct (exact)', percent(rates.name_exact), `${summary.fields.name_exact.correct}/${summary.fields.name_exact.scored}`);
  row('Name correct (incl. generic)', percent(rates.name_acceptable), `${summary.fields.name_acceptable.correct}/${summary.fields.name_acceptable.scored}`);
  row('Dosage correct', percent(rates.dosage_correct), `${summary.fields.dosage_correct.correct}/${summary.fields.dosage_correct.scored}`);
  row('Frequency correct', percent(rates.frequency_correct), `${summary.fields.frequency_correct.correct}/${summary.fields.frequency_correct.scored}`);
  row('Duration correct', percent(rates.duration_correct), `${summary.fields.duration_correct.correct}/${summary.fields.duration_correct.scored}`);
  row('Invented medicines', percent(rates.invention_rate), `${medicines.invented}/${medicines.predicted}`);

  console.log('\n  CONFIDENCE HONESTY');
  row('Confident AND correct', percent(rates.confidence_precision), `${confidence.confident_correct}/${confidence.confident_total}`);
  row('Confidently WRONG (worst case)', percent(rates.confidently_wrong_rate), `${confidence.confidently_wrong}/${confidence.confident_total}`);
  row('Uncertain flags that were real', percent(rates.uncertainty_usefulness), `${confidence.uncertain_wrong}/${confidence.uncertain_total}`);
  row('Inventions marked confident', confidence.invented_as_confident, '');

  console.log('\n  DRUG INTERACTION SAFETY');
  row('Interaction recall', percent(rates.interaction_recall), `${interactions.true_positive}/${interactions.true_positive + interactions.false_negative}`);
  row('Interaction precision', percent(rates.interaction_precision), `${interactions.true_positive}/${interactions.true_positive + interactions.false_positive}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!process.env.DASHSCOPE_API_KEY?.trim()) {
    console.error(
      '\nDASHSCOPE_API_KEY is not set.\n\n' +
        'The app falls back to canned demo data without it, which would score\n' +
        'near-perfectly and prove nothing. Set the key in backend/.env and rerun.\n'
    );
    process.exit(1);
  }

  const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, 'dataset.json'), 'utf8'));
  const cases = options.case
    ? dataset.cases.filter((entry) => entry.id === options.case)
    : dataset.cases;

  if (cases.length === 0) {
    console.error(`No cases matched --case ${options.case}`);
    process.exit(1);
  }

  const dbPath = path.join(os.tmpdir(), `nuskhasaathi-benchmark-${process.pid}-${Date.now()}.db`);
  console.log('\n' + '='.repeat(74));
  console.log('  NuskhaSaathi Accuracy Benchmark — live DashScope API');
  console.log('='.repeat(74));
  console.log(`  cases: ${cases.length}   runs: ${options.runs}   model: qwen-vl-plus + qwen-plus`);

  const { child, baseUrl } = await startServer(dbPath);
  const uploadedFiles = [];
  const runSummaries = [];
  const allCaseScores = [];

  try {
    const signup = await requestJson(baseUrl, 'POST', '/auth/signup', {
      body: {
        name: 'Benchmark Runner',
        email: `benchmark-${Date.now()}@test.nuskhasaathi.pk`,
        password: 'benchmark-password',
        age: 40,
      },
    });
    if (signup.status !== 201) {
      throw new Error(`benchmark signup failed: ${JSON.stringify(signup.data)}`);
    }
    const { token } = signup.data;

    for (let run = 1; run <= options.runs; run += 1) {
      if (options.runs > 1) console.log(`\n${'━'.repeat(74)}\n  RUN ${run} of ${options.runs}`);

      const caseScores = [];
      for (const testCase of cases) {
        const prediction = await runCase(baseUrl, token, testCase);
        if (prediction.image_url) uploadedFiles.push(path.basename(prediction.image_url));

        const score = scoreCase(testCase, prediction);
        score.run = run;
        score.raw_ocr_text = prediction.raw_ocr_text;
        score.elapsed_ms = prediction.elapsed_ms;
        score.urdu_instruction_coverage = `${prediction.urdu_instruction_coverage}/${prediction.medicines.length}`;

        printCaseReport(score, prediction);
        caseScores.push(score);
        allCaseScores.push(score);
      }

      const summary = aggregate(caseScores);
      summary.run = run;
      runSummaries.push(summary);
      if (options.runs > 1) printSummary(summary);
    }

    const overall = aggregate(allCaseScores);
    printSummary(overall);

    if (options.runs > 1) {
      console.log('  STABILITY ACROSS RUNS');
      for (const summary of runSummaries) {
        console.log(
          `    run ${summary.run}: capture ${percent(summary.rates.capture_rate)}` +
            `  dosage ${percent(summary.rates.dosage_correct)}` +
            `  confidently-wrong ${percent(summary.rates.confidently_wrong_rate)}`
        );
      }
      console.log('');
    }

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const reportPath = path.join(RESULTS_DIR, `benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          dataset_cases: dataset.cases.length,
          cases_run: cases.length,
          runs: options.runs,
          models: { ocr: 'qwen-vl-plus', text: 'qwen-plus' },
          overall,
          per_run: runSummaries,
          case_scores: allCaseScores,
        },
        null,
        2
      )
    );
    console.log(`  Full report: ${path.relative(PROJECT_ROOT, reportPath)}\n`);

    if (dataset.cases.length < 12) {
      console.log(
        `  NOTE: the dataset holds ${dataset.cases.length} of the 12 intended cases.\n` +
          '        Add more to benchmark/dataset.json to strengthen these numbers.\n'
      );
    }
  } finally {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Remove only the images this run uploaded; leave the dev uploads alone.
    if (!options.keep) {
      for (const filename of uploadedFiles) {
        try {
          fs.rmSync(path.join(BACKEND_ROOT, 'uploads', filename), { force: true });
        } catch {
          // best-effort cleanup
        }
      }
    }
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.rmSync(dbPath + suffix, { force: true });
      } catch {
        // best-effort cleanup
      }
    }
  }
}

main().catch((err) => {
  console.error('\nBenchmark failed:', err.message, '\n');
  process.exit(1);
});
