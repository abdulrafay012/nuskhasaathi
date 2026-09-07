const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  startServer,
  stopServer,
  request,
  createUser,
  createPrescription,
  insertMedicines,
  clearAllTables,
} = require('./helpers');
const {
  checkCrossPrescriptionInteractions,
} = require('../routes/instructions');

describe('Alibaba Cloud Hackathon Features', () => {
  before(async () => {
    await startServer();
  });

  after(async () => {
    await stopServer();
  });

  beforeEach(() => {
    clearAllTables();
  });

  describe('Alibaba Cloud Architecture Showcase', () => {
    it('GET /health/cloud returns Alibaba Cloud services health status', async () => {
      const res = await request('GET', '/health/cloud');
      assert.equal(res.status, 200);
      assert.equal(res.data.provider, 'Alibaba Cloud');
      assert.ok(res.data.services.ocr.model.includes('Qwen-VL'));
      assert.ok(res.data.services.llm.model.includes('Qwen Plus'));
      assert.equal(res.data.services.storage.provider, 'Alibaba Cloud OSS');
      assert.equal(res.data.healthy, true);
    });
  });

  describe('Cross-Prescription Safety Net (Multi-Doctor Interaction Checker)', () => {
    it('flags dangerous drug interaction across two different prescriptions', () => {
      const rx1 = {
        id: 'rx-cardio-01',
        uploaded_at: '2026-09-01T10:00:00Z',
        medicines: [{ name: 'Aspirin', dosage: '75mg' }],
      };
      const rx2 = {
        id: 'rx-ortho-02',
        uploaded_at: '2026-09-07T12:00:00Z',
        medicines: [{ name: 'Ibuprofen', dosage: '400mg' }],
      };

      const warnings = checkCrossPrescriptionInteractions([rx1, rx2]);
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].cross_prescription, true);
      assert.equal(warnings[0].medicine_a, 'Aspirin');
      assert.equal(warnings[0].medicine_b, 'Ibuprofen');
      assert.equal(warnings[0].prescription_a_id, 'rx-cardio-01');
      assert.equal(warnings[0].prescription_b_id, 'rx-ortho-02');
    });

    it('returns empty warnings when combinations across prescriptions are safe', () => {
      const rx1 = {
        id: 'rx-01',
        uploaded_at: '2026-09-01T10:00:00Z',
        medicines: [{ name: 'Panadol' }],
      };
      const rx2 = {
        id: 'rx-02',
        uploaded_at: '2026-09-07T12:00:00Z',
        medicines: [{ name: 'Augmentin' }],
      };

      const warnings = checkCrossPrescriptionInteractions([rx1, rx2]);
      assert.equal(warnings.length, 0);
    });

    it('GET /history/cross-interactions returns multi-doctor alerts for authenticated user', async () => {
      const user = await createUser();

      // Create Rx 1 from Doctor A with Warfarin
      const rx1 = createPrescription(user.id);
      insertMedicines(rx1, ['Warfarin']);

      // Create Rx 2 from Doctor B with Aspirin
      const rx2 = createPrescription(user.id);
      insertMedicines(rx2, ['Aspirin']);

      const res = await request('GET', '/history/cross-interactions', { token: user.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.cross_prescription_warnings.length, 1);
      assert.equal(res.data.cross_prescription_warnings[0].cross_prescription, true);
    });
  });

  describe('Interactive Urdu AI Voice Q&A (AI Rehnuma)', () => {
    it('POST /instructions/ask requires authentication', async () => {
      const res = await request('POST', '/instructions/ask', {
        body: { prescription_id: 'any', question: 'How to take this?' },
      });
      assert.equal(res.status, 401);
    });

    it('POST /instructions/ask validates question input', async () => {
      const user = await createUser();
      const rx = createPrescription(user.id);

      const res = await request('POST', '/instructions/ask', {
        token: user.token,
        body: { prescription_id: rx, question: '   ' },
      });
      assert.equal(res.status, 400);
      assert.match(res.data.error, /Question is required/i);
    });

    it('POST /instructions/ask answers patient question in Urdu and English', async () => {
      const user = await createUser();
      const rx = createPrescription(user.id);
      insertMedicines(rx, ['Panadol', 'Brufen']);

      const res = await request('POST', '/instructions/ask', {
        token: user.token,
        body: {
          prescription_id: rx,
          question: 'کھانے سے پہلے یا بعد میں لینی ہے؟',
        },
      });

      assert.equal(res.status, 200);
      assert.ok(res.data.answer_ur, 'Expected Urdu answer');
      assert.ok(res.data.answer_en, 'Expected English answer');
      assert.ok(res.data.source, 'Expected AI source indicator');
    });

    it('POST /instructions/ask rejects prescription belonging to another user', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const rx = createPrescription(owner.id);

      const res = await request('POST', '/instructions/ask', {
        token: stranger.token,
        body: {
          prescription_id: rx,
          question: 'Can I take this medicine with food?',
        },
      });

      assert.equal(res.status, 404);
      assert.match(res.data.error, /Prescription not found/i);
    });
  });
});
