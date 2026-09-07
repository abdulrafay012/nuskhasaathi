const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();
const DASHSCOPE_BASE_URL = (
  process.env.DASHSCOPE_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
).replace(/\/+$/, '');

// Hardcoded interaction reference table (small, accurate, well-known dangerous pairs)
const KNOWN_INTERACTIONS = [
  { a: 'Aspirin', b: 'Warfarin', warning: 'Increased bleeding risk — consult your doctor before combining.' },
  { a: 'Ibuprofen', b: 'Aspirin', warning: 'Combined use may increase stomach irritation risk.' },
  { a: 'Ibuprofen', b: 'Warfarin', warning: 'NSAIDs may increase anticoagulant effect — monitor closely.' },
  { a: 'Metformin', b: 'Alcohol', warning: 'Increased risk of lactic acidosis — avoid alcohol.' },
  { a: 'Lisinopril', b: 'Potassium', warning: 'May cause dangerously high potassium levels.' },
  { a: 'Simvastatin', b: 'Amiodarone', warning: 'Increased risk of muscle damage (rhabdomyolysis).' },
  { a: 'Warfarin', b: 'Fluconazole', warning: 'Fluconazole may significantly increase warfarin effect and bleeding risk.' },
  { a: 'Digoxin', b: 'Amiodarone', warning: 'Amiodarone increases digoxin levels — dose adjustment needed.' },
  { a: 'Methotrexate', b: 'Ibuprofen', warning: 'NSAIDs reduce methotrexate clearance — toxicity risk.' },
  { a: 'Ciprofloxacin', b: 'Theophylline', warning: 'Ciprofloxacin increases theophylline levels — toxicity risk.' },
  { a: 'Clopidogrel', b: 'Omeprazole', warning: 'Omeprazole may reduce clopidogrel effectiveness.' },
  { a: 'Sildenafil', b: 'Nitroglycerin', warning: 'Dangerous drop in blood pressure — do not combine.' },
  { a: 'MAO Inhibitors', b: 'SSRI', warning: 'Risk of serotonin syndrome — potentially life-threatening.' },
  { a: 'Lithium', b: 'Ibuprofen', warning: 'NSAIDs increase lithium levels — toxicity risk.' },
  { a: 'Amoxicillin', b: 'Methotrexate', warning: 'Amoxicillin may reduce methotrexate excretion — monitor closely.' },
];

const DEMO_INSTRUCTIONS = {
  panadol: 'یہ دوا بخار اور درد کو کم کرنے کے لیے ہے۔ کھانے کے بعد دن میں تین بار ایک گولی لیں۔',
  augmentin: 'یہ ایک اینٹی بایوٹک ہے جو انفیکشن کے علاج کے لیے ہے۔ دن میں دو بار ایک گولی، پورا کورس مکمل کریں۔',
  brufen: 'یہ سوزش اور درد کے لیے ہے۔ کھانے کے بعد لیں۔ خوراک کے بارے میں ڈاکٹر سے تصدیق کریں۔',
  amoxicillin: 'یہ اینٹی بایوٹک انفیکشن کے علاج کے لیے ہے۔ دن میں تین بار لیں۔',
  metformin: 'یہ ذیابیطس (شوگر) کو کنٹرول کرنے کے لیے ہے۔ روزانہ ایک بار کھانے کے ساتھ لیں۔',
  aspirin: 'یہ خون کو پتلا رکھنے کے لیے ہے۔ روزانہ ایک بار لیں۔',
  ibuprofen: 'یہ درد کے لیے ہے۔ ضرورت کے وقت لیں۔ ڈاکٹر سے مشورہ کریں۔',
};

// Check interactions between medicines
function checkInteractions(medicines) {
  const flags = [];
  const medNames = medicines.map((m) => m.name.toLowerCase());

  for (const interaction of KNOWN_INTERACTIONS) {
    const aIdx = medNames.indexOf(interaction.a.toLowerCase());
    const bIdx = medNames.indexOf(interaction.b.toLowerCase());

    if (aIdx !== -1 && bIdx !== -1) {
      flags.push({
        medicine_a: medicines[aIdx].name,
        medicine_b: medicines[bIdx].name,
        warning_text: interaction.warning,
      });
    }
  }

  return flags;
}

// POST /instructions — Generate Urdu instructions + interaction check
router.post('/', verifyToken, async (req, res) => {
  try {
    const { prescription_id } = req.body;

    if (!prescription_id) {
      return res.status(400).json({ error: 'prescription_id is required.' });
    }

    // Verify prescription belongs to this user
    const prescriptionCheck = await pool.query(
      'SELECT id FROM prescriptions WHERE id = $1 AND user_id = $2',
      [prescription_id, req.user.id]
    );

    if (prescriptionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Prescription not found.' });
    }

    // Fetch medicines for this prescription
    const medicinesResult = await pool.query(
      'SELECT * FROM medicines WHERE prescription_id = $1',
      [prescription_id]
    );

    if (medicinesResult.rows.length === 0) {
      return res.status(404).json({ error: 'No medicines found for this prescription. Run /identify-medicines first.' });
    }

    const medicines = medicinesResult.rows;

    // Check for drug interactions
    const interactionFlags = checkInteractions(medicines);

    // Generate Urdu instructions via Qwen, or use demo data without an API key
    let instructions = {};
    const hasDashScopeKey = Boolean(process.env.DASHSCOPE_API_KEY?.trim());

    if (!hasDashScopeKey) {
      console.log('Running in demo mode (no DASHSCOPE_API_KEY): using sample Urdu instructions.');
      instructions = Object.fromEntries(
        medicines.map((medicine) => [
          medicine.name,
          DEMO_INSTRUCTIONS[medicine.name.toLowerCase()] ||
            'اس دوا کے استعمال اور خوراک کے بارے میں اپنے ڈاکٹر یا فارماسسٹ سے تصدیق کریں۔',
        ])
      );
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const medicineListJson = JSON.stringify(
          medicines.map((m) => ({
            name: m.name,
            dosage: m.dosage,
            frequency: m.frequency,
            duration: m.duration,
          }))
        );

        const response = await fetch(
          `${DASHSCOPE_BASE_URL}/chat/completions`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
              model: 'qwen-plus',
              messages: [
                {
                  role: 'system',
                  content:
                    'You are a caring medical assistant explaining medicine instructions to a patient in simple, respectful Urdu. The patient may have low literacy, so avoid medical jargon. For each medicine, explain in 1-2 short sentences: what it is generally used for, and how/when to take it based on the dosage and frequency given. Do not give any medical advice beyond what is written on the prescription. If dosage or frequency is missing, say the patient should confirm with their doctor or pharmacist rather than guessing.\n\nOutput a JSON object where each key is the medicine name and the value is the Urdu instruction string.',
                },
                {
                  role: 'user',
                  content: `Here is the medicine list:\n${medicineListJson}\n\nGenerate the Urdu instructions for each medicine.`,
                },
              ],
            }),
          }
        );

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '{}';

        let cleanedContent = content.trim();
        if (cleanedContent.startsWith('```')) {
          cleanedContent = cleanedContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        instructions = JSON.parse(cleanedContent);
      } catch (llmErr) {
        if (llmErr.name === 'AbortError') {
          console.error('Instruction generation error: AI service request timed out.');
        } else {
          console.error('Instruction generation error:', llmErr);
        }
        instructions = {};
      } finally {
        clearTimeout(timeout);
      }
    }

    // Save interaction flags and medicine explanations atomically
    const client = await pool.connect();
    let updatedMedicines = [];
    try {
      await client.query('BEGIN');

      for (const flag of interactionFlags) {
        await client.query(
          `INSERT INTO interaction_flags (id, prescription_id, medicine_a, medicine_b, warning_text)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), prescription_id, flag.medicine_a, flag.medicine_b, flag.warning_text]
        );
      }

      for (const medicine of medicines) {
        const explanation =
          instructions[medicine.name] || instructions[medicine.name.toLowerCase()] || null;
        const updateResult = await client.query(
          `UPDATE medicines
           SET purpose_explanation = $1
           WHERE id = $2
           RETURNING *`,
          [explanation, medicine.id]
        );
        updatedMedicines.push(updateResult.rows[0]);
      }

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    res.json({
      message: 'Instructions generated successfully',
      prescription_id,
      medicines: updatedMedicines,
      interaction_warnings: interactionFlags,
    });
  } catch (err) {
    console.error('Instructions error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Check interactions across multiple prescriptions (cross-doctor safety net)
function checkCrossPrescriptionInteractions(prescriptions) {
  const flags = [];
  const seenPairs = new Set();

  for (let i = 0; i < prescriptions.length; i++) {
    for (let j = i + 1; j < prescriptions.length; j++) {
      const rxA = prescriptions[i];
      const rxB = prescriptions[j];
      const medsA = rxA.medicines || [];
      const medsB = rxB.medicines || [];

      for (const medA of medsA) {
        for (const medB of medsB) {
          const nameA = (medA.name || '').trim().toLowerCase();
          const nameB = (medB.name || '').trim().toLowerCase();

          for (const interaction of KNOWN_INTERACTIONS) {
            const intA = interaction.a.toLowerCase();
            const intB = interaction.b.toLowerCase();

            const matchForward = nameA.includes(intA) && nameB.includes(intB);
            const matchReverse = nameA.includes(intB) && nameB.includes(intA);

            if (matchForward || matchReverse) {
              const pairKey = [nameA, nameB].sort().join('::');
              if (!seenPairs.has(pairKey)) {
                seenPairs.add(pairKey);
                flags.push({
                  medicine_a: medA.name,
                  prescription_a_id: rxA.id,
                  prescription_a_date: rxA.uploaded_at,
                  medicine_b: medB.name,
                  prescription_b_id: rxB.id,
                  prescription_b_date: rxB.uploaded_at,
                  warning_text: interaction.warning,
                  cross_prescription: true,
                });
              }
            }
          }
        }
      }
    }
  }

  return flags;
}

// POST /instructions/ask — AI Rehnuma Q&A in Urdu via Qwen
router.post('/ask', verifyToken, async (req, res) => {
  try {
    const { prescription_id, question } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required.' });
    }

    if (!prescription_id) {
      return res.status(400).json({ error: 'prescription_id is required.' });
    }

    // Verify ownership
    const rxCheck = await pool.query(
      'SELECT id, uploaded_at FROM prescriptions WHERE id = $1 AND user_id = $2',
      [prescription_id, req.user.id]
    );

    if (rxCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Prescription not found.' });
    }

    const medicinesResult = await pool.query(
      'SELECT name, dosage, frequency, duration, purpose_explanation FROM medicines WHERE prescription_id = $1',
      [prescription_id]
    );

    const medicines = medicinesResult.rows;
    const medListStr = medicines
      .map((m) => `${m.name} (${m.dosage || 'dose unspecified'}, ${m.frequency || 'timing unspecified'})`)
      .join(', ');

    const hasDashScopeKey = Boolean(process.env.DASHSCOPE_API_KEY?.trim());

    if (!hasDashScopeKey) {
      // Grounded mock Q&A for demo mode
      const qLower = question.toLowerCase();
      let answer_ur = '';
      let answer_en = '';

      if (qLower.includes('food') || qLower.includes('کھان') || qLower.includes('پہلے') || qLower.includes('بعد') || qLower.includes('before') || qLower.includes('after')) {
        answer_ur = 'زیادہ تر درد اور اینٹی بایوٹک ادویات معدے کی حفاظت کے لیے کھانے کے بعد لینی چاہییں۔ پیناڈول ضرورت کے وقت لی جا سکتی ہے۔ اگر شک ہو تو فارماسسٹ سے تصدیق کریں۔';
        answer_en = 'Most pain relievers and antibiotics should be taken after meals to protect your stomach. Panadol can be taken as needed. Always verify with your pharmacist.';
      } else if (qLower.includes('miss') || qLower.includes('بھول') || qLower.includes('forget') || qLower.includes('چھوٹ')) {
        answer_ur = 'اگر آپ ایک خوراک بھول جائیں تو یاد آنے پر فوراً لیں۔ لیکن اگر اگلی خوراک کا وقت قریب ہو تو چھوٹی ہوئی خوراک چھوڑ دیں — کبھی بھی ایک وقت میں دو گولیاں نہ لیں۔';
        answer_en = 'If you miss a dose, take it as soon as you remember. However, if it is almost time for your next dose, skip the missed dose. Never take a double dose.';
      } else if (qLower.includes('milk') || qLower.includes('پانی') || qLower.includes('دودھ') || qLower.includes('water')) {
        answer_ur = 'عام طور پر تمام گولیاں پورے گلاس تازہ پانی کے ساتھ لینا بہترین ہے۔ کچھ اینٹی بایوٹک دودھ کے ساتھ اثر کم کرتی ہیں، اس لیے سادہ پانی کا استعمال کریں۔';
        answer_en = 'Generally, take medicines with a full glass of plain water. Some antibiotics absorb poorly with milk or dairy, so plain water is recommended.';
      } else {
        answer_ur = `آپ کے نسخے میں شامل ادویات (${medListStr}) کے لیے ڈاکٹر کی بتائی گئی خوراک اور اوقات پر باقاعدگی سے عمل کریں۔ کوئی بھی دوا خود سے بند نہ کریں۔`;
        answer_en = `For your prescribed medicines (${medListStr}), follow the exact dosage and schedule recommended by your doctor. Consult your doctor before stopping any medication.`;
      }

      return res.json({
        prescription_id,
        question: question.trim(),
        answer_ur,
        answer_en,
        source: 'NuskhaSaathi AI Rehnuma (Alibaba Cloud Qwen Demo)',
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const systemPrompt = `You are NuskhaSaathi AI Rehnuma, a caring medical prescription assistant in Pakistan.
The patient has this active prescription: ${medListStr}
Answer the patient's question concisely in JSON format:
{
  "answer_ur": "2-3 short, clear Urdu sentences in Urdu script (نستعلیق/نسخ friendly).",
  "answer_en": "2 short sentences in English."
}
Never change doses or prescribe new drugs. Always urge caution.`;

    const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question.trim() },
        ],
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`DashScope API error: ${response.status}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || '{}';
    let cleanJson = rawContent.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    let parsed = {};
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      parsed = {
        answer_ur: cleanJson,
        answer_en: 'Please consult your doctor regarding this question.',
      };
    }

    res.json({
      prescription_id,
      question: question.trim(),
      answer_ur: parsed.answer_ur || 'براہ کرم اس سوال کے لیے اپنے معالج سے مشورہ کریں۔',
      answer_en: parsed.answer_en || 'Please consult your doctor regarding this question.',
      source: 'Qwen Plus (Alibaba Cloud ModelStudio)',
    });
  } catch (err) {
    console.error('AI Rehnuma error:', err);
    res.status(500).json({ error: 'Could not generate answer. Please try again.' });
  }
});

// POST /instructions/scan-pill — AI Pill Scanner using Vision AI
router.post('/scan-pill', verifyToken, async (req, res) => {
  try {
    // Normally we would accept an image file and use qwen-vl-plus here.
    // For the hackathon demo, we will accept a description of the pill if vision API is not set up,
    // or simulate the vision model.
    const { prescription_id, pill_description } = req.body;
    
    if (!prescription_id) {
      return res.status(400).json({ error: 'prescription_id is required.' });
    }

    const rxCheck = await pool.query(
      'SELECT id FROM prescriptions WHERE id = $1 AND user_id = $2',
      [prescription_id, req.user.id]
    );

    if (rxCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Prescription not found.' });
    }

    const medicinesResult = await pool.query(
      'SELECT name, dosage, frequency, purpose_explanation FROM medicines WHERE prescription_id = $1',
      [prescription_id]
    );

    const medicines = medicinesResult.rows;
    if (medicines.length === 0) {
      return res.status(404).json({ error: 'No medicines found in this prescription.' });
    }

    const medListStr = medicines
      .map((m) => `${m.name} (${m.dosage || 'dose unspecified'}, ${m.frequency || 'timing unspecified'})`)
      .join(', ');

    const hasDashScopeKey = Boolean(process.env.DASHSCOPE_API_KEY?.trim());

    if (!hasDashScopeKey) {
      // Mock mode
      const identified = medicines[0];
      const answer_ur = `تصویر سے لگ رہا ہے کہ یہ ${identified.name} ہے۔ آپ کی خوراک ${identified.dosage || 'طے شدہ'} ہے۔ برائے مہربانی احتیاط کریں۔`;
      const answer_en = `Based on the scan, this appears to be ${identified.name}. Please take it as prescribed: ${identified.dosage || 'directed'}.`;
      return res.json({
        prescription_id,
        identified_medicine: identified.name,
        answer_ur,
        answer_en,
        source: 'NuskhaSaathi AI Scanner (Mock Vision)',
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const systemPrompt = `You are an AI Pill Scanner for elderly patients in Pakistan.
The patient's current prescription includes: ${medListStr}.
The user has scanned a pill which looks like: "${pill_description || 'a generic pill'}".
Match this description to ONE of the medicines in the prescription. Answer in JSON:
{
  "identified_medicine": "Name of the matched medicine from the list",
  "answer_ur": "1-2 short Urdu sentences saying 'This looks like [Medicine], take it [Frequency]'",
  "answer_en": "1-2 short English sentences"
}`;

    const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: "What pill is this?" },
        ],
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) throw new Error(`DashScope API error: ${response.status}`);

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || '{}';
    let cleanJson = rawContent.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    
    let parsed = { identified_medicine: 'Unknown', answer_ur: 'معذرت، میں اس دوا کو پہچان نہیں سکا۔', answer_en: 'Sorry, I could not identify this medicine.' };
    try { parsed = JSON.parse(cleanJson); } catch {}

    res.json({
      prescription_id,
      ...parsed,
      source: 'Qwen Plus (Alibaba Cloud ModelStudio)',
    });
  } catch (err) {
    console.error('Pill Scanner error:', err);
    res.status(500).json({ error: 'Could not identify pill.' });
  }
});

// GET /instructions/diet-plan — AI Diet Coach
router.get('/diet-plan/:prescription_id', verifyToken, async (req, res) => {
  try {
    const { prescription_id } = req.params;

    const rxCheck = await pool.query(
      'SELECT id FROM prescriptions WHERE id = $1 AND user_id = $2',
      [prescription_id, req.user.id]
    );

    if (rxCheck.rows.length === 0) return res.status(404).json({ error: 'Prescription not found.' });

    const medicinesResult = await pool.query(
      'SELECT name FROM medicines WHERE prescription_id = $1',
      [prescription_id]
    );

    const medicines = medicinesResult.rows.map(m => m.name).join(', ');

    const hasDashScopeKey = Boolean(process.env.DASHSCOPE_API_KEY?.trim());

    if (!hasDashScopeKey) {
      return res.json({
        prescription_id,
        diet_ur: 'اپنی ادویات کے ساتھ متوازن غذا کھائیں۔ زیادہ نمک اور چینی سے پرہیز کریں۔\n• پانی زیادہ پییں۔\n• تلی ہوئی چیزوں سے گریز کریں۔',
        diet_en: 'Maintain a balanced diet with your medications. Avoid excessive salt and sugar.\n• Drink plenty of water.\n• Avoid fried foods.',
        source: 'NuskhaSaathi Diet Coach (Demo)'
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const systemPrompt = `You are a medical dietitian in Pakistan. The patient is taking these medicines: ${medicines}.
Provide dietary advice and restrictions (Parhez) for a patient taking these specific medicines.
Answer in JSON:
{
  "diet_ur": "3-4 bullet points in Urdu script advising what to eat and what to avoid (e.g. avoid grapefruit, eat less salt). Use newlines for bullet points.",
  "diet_en": "3-4 bullet points in English. Use newlines for bullet points."
}`;

    const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: "Generate my diet plan." }],
        temperature: 0.5,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) throw new Error(`DashScope API error: ${response.status}`);

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || '{}';
    let cleanJson = rawContent.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    
    let parsed = { diet_ur: 'پرہیز کی معلومات دستیاب نہیں۔', diet_en: 'Diet info unavailable.' };
    try { parsed = JSON.parse(cleanJson); } catch {}

    res.json({
      prescription_id,
      ...parsed,
      source: 'Qwen Plus (Alibaba Cloud ModelStudio)',
    });
  } catch (err) {
    console.error('Diet Coach error:', err);
    res.status(500).json({ error: 'Could not generate diet plan.' });
  }
});

// GET /instructions/alternatives/:prescription_id — AI Generic Alternatives
router.get('/alternatives/:prescription_id', verifyToken, async (req, res) => {
  try {
    const { prescription_id } = req.params;

    const rxCheck = await pool.query(
      'SELECT id FROM prescriptions WHERE id = $1 AND user_id = $2',
      [prescription_id, req.user.id]
    );

    if (rxCheck.rows.length === 0) return res.status(404).json({ error: 'Prescription not found.' });

    const medicinesResult = await pool.query(
      'SELECT name, dosage FROM medicines WHERE prescription_id = $1',
      [prescription_id]
    );

    const medicines = medicinesResult.rows;
    if (medicines.length === 0) return res.status(404).json({ error: 'No medicines found.' });

    const medListStr = medicines.map(m => `${m.name} (${m.dosage || 'unspecified'})`).join(', ');

    const hasDashScopeKey = Boolean(process.env.DASHSCOPE_API_KEY?.trim());

    if (!hasDashScopeKey) {
      // Mock mode
      const mockAlts = medicines.map(m => ({
        original: m.name,
        generic: m.name.includes('Panadol') ? 'Paracetamol (Generic)' : `${m.name} (Generic Equivalent)`,
        estimated_savings: '40% - 60%',
        reason: 'Generic versions contain the exact same active ingredient but cost significantly less because you are not paying for the brand name.'
      }));
      return res.json({
        prescription_id,
        alternatives: mockAlts,
        source: 'NuskhaSaathi Smart Pharmacy (Demo)'
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const systemPrompt = `You are a helpful pharmacist in Pakistan. The patient has been prescribed: ${medListStr}.
Suggest cheaper generic equivalents or local Pakistani alternatives for these medicines.
Respond in JSON format:
{
  "alternatives": [
    {
      "original": "Original brand name",
      "generic": "Suggested generic/cheaper alternative",
      "estimated_savings": "e.g., 50%",
      "reason": "Short explanation in English"
    }
  ]
}`;

    const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: "Find cheaper alternatives." }],
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) throw new Error(`DashScope API error: ${response.status}`);

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || '{}';
    let cleanJson = rawContent.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    
    let parsed = { alternatives: [] };
    try { parsed = JSON.parse(cleanJson); } catch {}

    res.json({
      prescription_id,
      alternatives: parsed.alternatives || [],
      source: 'Qwen Plus (Alibaba Cloud ModelStudio)',
    });
  } catch (err) {
    console.error('Alternatives error:', err);
    res.status(500).json({ error: 'Could not fetch alternatives.' });
  }
});

// POST /instructions/triage — AI Symptom & Side-Effect Triage
router.post('/triage', verifyToken, async (req, res) => {
  try {
    const { prescription_id, symptom } = req.body;

    if (!prescription_id || !symptom) {
      return res.status(400).json({ error: 'Prescription ID and symptom are required.' });
    }

    const rxCheck = await pool.query(
      'SELECT id FROM prescriptions WHERE id = $1 AND user_id = $2',
      [prescription_id, req.user.id]
    );

    if (rxCheck.rows.length === 0) return res.status(404).json({ error: 'Prescription not found.' });

    const medicinesResult = await pool.query(
      'SELECT name FROM medicines WHERE prescription_id = $1',
      [prescription_id]
    );

    const medListStr = medicinesResult.rows.map(m => m.name).join(', ');

    const hasDashScopeKey = Boolean(process.env.DASHSCOPE_API_KEY?.trim());

    if (!hasDashScopeKey) {
      // Mock mode
      const isSevere = symptom.toLowerCase().includes('chest') || symptom.toLowerCase().includes('breath');
      return res.json({
        severity: isSevere ? 'severe' : 'mild',
        assessment: isSevere 
          ? `🚨 URGENT: "${symptom}" could be a severe reaction to ${medListStr || 'your medicine'}. Please seek emergency medical care immediately.`
          : `ℹ️ "${symptom}" is a common mild side effect of ${medListStr || 'your medicine'}. Stay hydrated and rest. If it persists, consult your doctor.`,
        action_required: isSevere
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const systemPrompt = `You are an AI medical triage assistant. The patient is currently taking: ${medListStr || 'no known medicines'}.
The patient reports the following symptom: "${symptom}".
Analyze if this is a known side effect of their medicines or a medical emergency.
Respond in JSON format:
{
  "severity": "mild" | "moderate" | "severe",
  "assessment": "Brief explanation and advice in English",
  "action_required": true (if they should see a doctor/ER) or false (if they can manage at home)
}`;

    const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: "Triage my symptom." }],
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) throw new Error(`DashScope API error: ${response.status}`);

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || '{}';
    let cleanJson = rawContent.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    
    let parsed = { severity: 'unknown', assessment: 'Could not analyze symptom.', action_required: true };
    try { parsed = JSON.parse(cleanJson); } catch {}

    res.json(parsed);
  } catch (err) {
    console.error('Triage error:', err);
    res.status(500).json({ error: 'Could not perform triage analysis.' });
  }
});

module.exports = router;
module.exports.checkInteractions = checkInteractions;
module.exports.checkCrossPrescriptionInteractions = checkCrossPrescriptionInteractions;
module.exports.KNOWN_INTERACTIONS = KNOWN_INTERACTIONS;
