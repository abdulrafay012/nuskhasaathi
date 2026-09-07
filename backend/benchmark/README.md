# NuskhaSaathi Accuracy Benchmark

Measures how often the real pipeline reads a prescription correctly, against
hand-transcribed ground truth.

```bash
cd backend
npm run benchmark                      # all cases, one run
npm run benchmark -- --runs 3          # repeat to show run-to-run variance
npm run benchmark -- --case rx-002-karachi
npm run benchmark -- --keep-uploads    # keep the uploaded images for inspection
```

## How it works

The harness spawns the **real `server.js`** on a free port and drives the real
HTTP routes — `/upload` → `/identify-medicines` → `/instructions` — exactly as
the browser does. No pipeline code was changed or re-implemented to make it
measurable, so what it scores is what ships.

Two safeguards:

- **It refuses to run without `DASHSCOPE_API_KEY`.** The app falls back to
  canned demo data when the key is absent, which would score near-perfectly
  and prove nothing.
- **It uses a throwaway SQLite file** (`SQLITE_PATH`) and deletes the images it
  uploaded, so a run never touches the development database or leaves litter in
  `backend/uploads/`.

Results are printed as a summary and written to `benchmark/results/*.json`.

## Ground truth

`dataset.json` holds the answer key. Each case was transcribed **by reading the
image directly** — never by running the pipeline, which would make the whole
exercise circular.

Per medicine: `name`, `dosage`, `frequency`, `duration`, plus two optional
fairness fields:

- `aliases` — clinically identical names. Returning `Ibuprofen` where the paper
  says `Brufen` counts as `name_acceptable` but not `name_exact`, so the two are
  reported separately rather than blurred.
- `frequency_alt` / `duration_alt` — other defensible readings of an ambiguous
  instruction (`"BD as needed"`), so a correct answer is not marked wrong just
  because the transcriber phrased it differently.

`expected_interactions` lists the clinically dangerous pairs actually present.
An empty list is a real test: any warning raised on that case is a false alarm.

## Metrics

**Reading the prescription**

| Metric | Meaning |
|---|---|
| Medicines captured | Ground-truth medicines the pipeline found (recall) |
| Name correct (exact) | Aligned medicines whose name matches exactly |
| Name correct (incl. generic) | …or matches via a clinically equivalent alias |
| Dosage / Frequency / Duration correct | Field matches after normalization |
| Invented medicines | Returned medicines with no counterpart on the paper |

Both-absent counts as agreement; a **hallucinated** dosage is penalised exactly
like a **dropped** one.

**Confidence honesty** — whether the `confident` / `uncertain` badge means
anything:

| Metric | Meaning |
|---|---|
| Confident AND correct | Precision of the `confident` badge |
| **Confidently wrong** | Marked `confident` but misread — the dangerous case |
| Uncertain flags that were real | `uncertain` reads that were genuinely wrong (useful hedging, not noise) |
| Inventions marked confident | Invented medicines presented as certain |

"Correct" here means name acceptable **and** dosage **and** frequency correct.
Duration is excluded because it is frequently absent from the paper itself.

**Drug interaction safety** — recall and precision against the expected pairs.
Matching is order-insensitive and brand-insensitive (`Brufen + Disprin` matches
`Aspirin + Ibuprofen`).

Rates are computed from summed totals, never averaged across cases — otherwise
a prescription with one medicine would count as much as one with six.

## Is the scorer itself trustworthy?

`backend/tests/benchmarkMetrics.test.js` feeds it deliberately wrong pipeline
output and asserts each mistake lands in the right bucket: dropped medicines,
inventions, wrong dosage, wrong frequency, hallucinated duration, missed
interactions, false alarms, and confidently-wrong reads. A benchmark that
reports 100% is only worth reading if it can also report failure.

Run with `npm test`.

## Current limitation

The dataset holds **2 of the 12 intended cases**, and both are clean, evenly-lit
images in a near-print handwriting style. They do **not** test the hard case the
product exists for: genuinely messy doctor handwriting, poor lighting, skew, and
Urdu script. The current 100% should be read as *"the pipeline handles legible
prescriptions reliably"* — not as a general accuracy claim.

Adding cases is pure data entry: drop the image in `test-assets/`, append an
entry to `dataset.json`, rerun.
