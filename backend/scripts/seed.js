const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const initDB = require('../config/initDB');

const DEMO_USER = {
  name: 'Test Patient',
  email: 'test@nuskhasaathi.com',
  password: 'demo123456',
};

const SAMPLE_PRESCRIPTIONS = [
  {
    imageUrl: '/test-assets/prescription-sample-1.png',
    rawOcrText: `Dr. M. Ahmed, MBBS\nPt: Test Patient   Date: 04/09/26\nRx:\n1. Tab Panado1 500 mg - 1 tab TDS x 5/7 (after meals)\n2. Tab Augmentin 625mg - 1 BD x 7 days\n3. Tab Brufan? 400 mg - 1 BD PC x 3 days\nReview after one week.`,
    medicines: [
      {
        name: 'Panadol',
        dosage: '500mg',
        frequency: 'three times a day',
        duration: '5 days',
        confidence: 'confident',
        purposeExplanation:
          'یہ دوا بخار اور درد کو کم کرنے کے لیے ہے۔ کھانے کے بعد دن میں تین بار ایک گولی لیں۔',
      },
      {
        name: 'Augmentin',
        dosage: '625mg',
        frequency: 'twice a day',
        duration: '7 days',
        confidence: 'confident',
        purposeExplanation:
          'یہ ایک اینٹی بایوٹک ہے جو انفیکشن کے علاج کے لیے ہے۔ دن میں دو بار ایک گولی، پورا کورس مکمل کریں۔',
      },
      {
        name: 'Brufen',
        dosage: '400mg',
        frequency: 'twice a day',
        duration: '3 days',
        confidence: 'uncertain',
        purposeExplanation:
          'یہ سوزش اور درد کے لیے ہے۔ کھانے کے بعد لیں۔ خوراک کے بارے میں ڈاکٹر سے تصدیق کریں۔',
      },
    ],
    interactions: [],
  },
  {
    imageUrl: '/test-assets/prescription-sample-2.png',
    rawOcrText: `Clinic Rx — handwriting partly unclear\nPt. Test Patient\nCap Amoxycillin 500 mg TDS x 7/7\nTab Metfornin 500mg OD with food\nTab Aspirin 75 mg OD\nTab Ibuprofin? 400 mg SOS pain\nAdv: continue regular medicines; follow up PRN.`,
    medicines: [
      {
        name: 'Amoxicillin',
        dosage: '500mg',
        frequency: 'three times a day',
        duration: '7 days',
        confidence: 'confident',
        purposeExplanation: 'یہ اینٹی بایوٹک انفیکشن کے علاج کے لیے ہے۔ دن میں تین بار لیں۔',
      },
      {
        name: 'Metformin',
        dosage: '500mg',
        frequency: 'once a day',
        duration: null,
        confidence: 'confident',
        purposeExplanation:
          'یہ ذیابیطس (شوگر) کو کنٹرول کرنے کے لیے ہے۔ روزانہ ایک بار کھانے کے ساتھ لیں۔',
      },
      {
        name: 'Aspirin',
        dosage: '75mg',
        frequency: 'once a day',
        duration: null,
        confidence: 'confident',
        purposeExplanation: 'یہ خون کو پتلا رکھنے کے لیے ہے۔ روزانہ ایک بار لیں۔',
      },
      {
        name: 'Ibuprofen',
        dosage: '400mg',
        frequency: 'as needed',
        duration: null,
        confidence: 'uncertain',
        purposeExplanation: 'یہ درد کے لیے ہے۔ ضرورت کے وقت لیں۔ ڈاکٹر سے مشورہ کریں۔',
      },
    ],
    interactions: [
      {
        medicineA: 'Ibuprofen',
        medicineB: 'Aspirin',
        warningText: 'Combined use may increase stomach irritation risk.',
      },
    ],
  },
];

async function ensureDemoUser() {
  const passwordHash = await bcrypt.hash(DEMO_USER.password, 10);
  const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [DEMO_USER.email]);

  if (existingUser.rows.length > 0) {
    const userId = existingUser.rows[0].id;
    await pool.query('UPDATE users SET name = $1, password_hash = $2 WHERE id = $3', [
      DEMO_USER.name,
      passwordHash,
      userId,
    ]);
    console.log(`Reusing demo user ${DEMO_USER.email}`);
    return userId;
  }

  const userId = uuidv4();
  await pool.query(
    'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)',
    [userId, DEMO_USER.name, DEMO_USER.email, passwordHash]
  );
  console.log(`Created demo user ${DEMO_USER.email}`);
  return userId;
}

async function insertPrescription(client, userId, sample, index) {
  const prescriptionId = uuidv4();
  await client.query(
    `INSERT INTO prescriptions (id, user_id, image_url, raw_ocr_text)
     VALUES ($1, $2, $3, $4)`,
    [prescriptionId, userId, sample.imageUrl, sample.rawOcrText]
  );

  for (const medicine of sample.medicines) {
    await client.query(
      `INSERT INTO medicines
       (id, prescription_id, name, dosage, frequency, duration, purpose_explanation, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        uuidv4(),
        prescriptionId,
        medicine.name,
        medicine.dosage,
        medicine.frequency,
        medicine.duration,
        medicine.purposeExplanation,
        medicine.confidence,
      ]
    );
  }

  for (const interaction of sample.interactions) {
    await client.query(
      `INSERT INTO interaction_flags
       (id, prescription_id, medicine_a, medicine_b, warning_text)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        uuidv4(),
        prescriptionId,
        interaction.medicineA,
        interaction.medicineB,
        interaction.warningText,
      ]
    );
  }

  console.log(
    `Inserted prescription ${index + 1} with ${sample.medicines.length} medicines and ${sample.interactions.length} interaction warning(s)`
  );
}

async function seed() {
  console.log('Initializing database...');
  await initDB();

  const userId = await ensureDemoUser();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM interaction_flags WHERE prescription_id IN (SELECT id FROM prescriptions WHERE user_id = $1)',
      [userId]
    );
    await client.query(
      'DELETE FROM medicines WHERE prescription_id IN (SELECT id FROM prescriptions WHERE user_id = $1)',
      [userId]
    );
    await client.query('DELETE FROM prescriptions WHERE user_id = $1', [userId]);
    console.log('Cleared existing demo prescriptions');

    for (const [index, sample] of SAMPLE_PRESCRIPTIONS.entries()) {
      await insertPrescription(client, userId, sample, index);
    }

    await client.query('COMMIT');
    console.log('Seed complete. Login with test@nuskhasaathi.com / demo123456');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
