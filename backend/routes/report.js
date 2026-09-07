const express = require('express');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');

const router = express.Router();

const COLORS = {
  teal: '#0d9488',
  tealDark: '#115e59',
  tealPale: '#f0fdfa',
  ink: '#1f2937',
  muted: '#6b7280',
  line: '#ccfbf1',
  amber: '#d97706',
  amberPale: '#fffbeb',
  red: '#b45309',
  white: '#ffffff',
};

const FONT_CANDIDATES = [
  path.join(__dirname, '..', 'fonts', 'NotoNaskhArabic.ttf'),
  path.join(__dirname, '..', 'fonts', 'NotoNaskhArabic-Regular.ttf'),
  path.join(__dirname, '..', 'fonts', 'NotoSansArabic-Regular.ttf'),
];
const arabicFontPath = FONT_CANDIDATES.find((fontPath) => fs.existsSync(fontPath));

if (!arabicFontPath) {
  console.warn('Urdu PDF font not found. Falling back to Helvetica; Urdu text may not render correctly.');
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-PK', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

function drawCapsule(doc, x, y) {
  doc.save();
  doc.roundedRect(x, y, 28, 13, 6.5).fill(COLORS.teal);
  doc.rect(x + 14, y, 14, 13).fill('#5eead4');
  doc.moveTo(x + 14, y + 1).lineTo(x + 14, y + 12).lineWidth(1).stroke(COLORS.white);
  doc.restore();
}

function drawConfidenceBadge(doc, confidence, x, y) {
  const confident = confidence === 'confident';
  const label = confident ? 'Confident' : 'Uncertain';
  const width = confident ? 77 : 76;
  const fill = confident ? '#dcfce7' : '#fef3c7';
  const color = confident ? '#166534' : '#92400e';

  doc.save();
  doc.roundedRect(x, y, width, 22, 11).fill(fill);
  if (confident) {
    doc.circle(x + 12, y + 11, 5).lineWidth(1.3).stroke(color);
    doc.moveTo(x + 9.5, y + 11).lineTo(x + 11.5, y + 13).lineTo(x + 15, y + 8.5).stroke(color);
  } else {
    doc.moveTo(x + 7, y + 16).lineTo(x + 12, y + 6).lineTo(x + 17, y + 16).closePath().stroke(color);
    doc.moveTo(x + 12, y + 9).lineTo(x + 12, y + 13).stroke(color);
  }
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(color).text(label, x + 21, y + 7, {
    width: width - 25,
    lineBreak: false,
  });
  doc.restore();
  return width;
}

function drawWarningIcon(doc, x, y) {
  doc.save();
  doc.moveTo(x, y + 18).lineTo(x + 9, y).lineTo(x + 18, y + 18).closePath().fill(COLORS.amber);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.white).text('!', x + 7.2, y + 6, {
    lineBreak: false,
  });
  doc.restore();
}

function drawFooter(doc) {
  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    const y = doc.page.height - 42;
    doc.moveTo(54, y - 8).lineTo(doc.page.width - 54, y - 8).lineWidth(0.6).stroke(COLORS.line);
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(
      'NuskhaSaathi — Alibaba Cloud AI Hackathon Pakistan 2026 — Healthcare Track',
      54,
      y,
      { width: doc.page.width - 108, align: 'center', lineBreak: false }
    );
  }
}

function buildReport({ prescription, medicines, interactions, patientName }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      bufferPages: true,
      margin: 54,
      size: 'A4',
      info: {
        Title: `NuskhaSaathi Prescription Report ${prescription.id}`,
        Author: 'NuskhaSaathi',
        Subject: 'Prescription medicine guidance report',
      },
    });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      doc.addPage();
      if (arabicFontPath) doc.registerFont('Urdu', arabicFontPath);

      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const ensureSpace = (height) => {
        if (doc.y + height > doc.page.height - 72) {
          doc.addPage();
          doc.y = doc.page.margins.top;
        }
      };

      drawCapsule(doc, 54, 60);
      doc.font('Helvetica-Bold').fontSize(22).fillColor(COLORS.teal).text(
        'NuskhaSaathi — Prescription Report',
        92,
        55,
        { width: contentWidth - 38 }
      );
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(
        `Generated ${formatDate(new Date())}`,
        54,
        88,
        { width: contentWidth, align: 'right' }
      );

      const patientPanelY = 118;
      doc.roundedRect(54, patientPanelY, contentWidth, 84, 12).fill(COLORS.tealPale);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.tealDark).text('PATIENT', 72, patientPanelY + 16);
      doc.font('Helvetica').fontSize(12).fillColor(COLORS.ink).text(patientName || 'Patient', 72, patientPanelY + 31, {
        width: 210,
      });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.tealDark).text('PRESCRIPTION DATE', 312, patientPanelY + 16);
      doc.font('Helvetica').fontSize(11).fillColor(COLORS.ink).text(formatDate(prescription.uploaded_at), 312, patientPanelY + 31, {
        width: contentWidth - 258,
      });
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(
        `Reference: ${prescription.image_url || prescription.id}`,
        72,
        patientPanelY + 63,
        { width: contentWidth - 36, ellipsis: true }
      );
      doc.y = 224;
      doc.moveTo(54, doc.y).lineTo(doc.page.width - 54, doc.y).lineWidth(1).stroke(COLORS.line);

      doc.moveDown(1.6);
      doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.ink).text(`Medicines (${medicines.length})`);
      doc.moveDown(0.7);

      if (medicines.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted).text('No medicines are recorded for this prescription.');
        doc.moveDown(1.5);
      }

      medicines.forEach((medicine, index) => {
        const instruction = medicine.purpose_explanation || 'No Urdu instructions are available for this medicine.';
        if (arabicFontPath) doc.font('Urdu').fontSize(12);
        else doc.font('Helvetica').fontSize(10);
        const instructionHeight = doc.heightOfString(instruction, { width: contentWidth - 36, align: 'right' });
        const blockHeight = Math.max(118, 91 + instructionHeight);
        ensureSpace(blockHeight + 14);

        const blockY = doc.y;
        doc.roundedRect(54, blockY, contentWidth, blockHeight, 10).fillAndStroke('#f8fafc', '#e5e7eb');
        doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.ink).text(
          `${index + 1}. ${medicine.name}`,
          70,
          blockY + 15,
          { width: contentWidth - 185, lineBreak: false, ellipsis: true }
        );
        drawConfidenceBadge(doc, medicine.confidence, doc.page.width - 148, blockY + 12);

        const details = [
          ['Dosage', medicine.dosage || 'Not specified'],
          ['Frequency', medicine.frequency || 'Not specified'],
          ['Duration', medicine.duration || 'Not specified'],
        ];
        const columnWidth = (contentWidth - 32) / 3;
        details.forEach(([label, value], detailIndex) => {
          const x = 70 + detailIndex * columnWidth;
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.tealDark).text(label.toUpperCase(), x, blockY + 46, {
            width: columnWidth - 10,
          });
          doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.ink).text(value, x, blockY + 59, {
            width: columnWidth - 10,
            ellipsis: true,
            height: 24,
          });
        });

        doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.tealDark).text('URDU INSTRUCTIONS', 70, blockY + 84);
        if (arabicFontPath) doc.font('Urdu').fontSize(12);
        else doc.font('Helvetica').fontSize(10);
        doc.fillColor(COLORS.ink).text(instruction, 70, blockY + 99, {
          width: contentWidth - 32,
          align: arabicFontPath ? 'right' : 'left',
          lineGap: 3,
        });
        doc.y = blockY + blockHeight + 14;
      });

      if (interactions.length > 0) {
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.ink).text('Interaction Warnings');
        doc.moveDown(0.6);

        interactions.forEach((warning) => {
          const warningText = `${warning.medicine_a || 'Medicine'} + ${warning.medicine_b || 'Medicine'}: ${warning.warning_text}`;
          doc.font('Helvetica').fontSize(9.5);
          const warningHeight = Math.max(58, doc.heightOfString(warningText, { width: contentWidth - 62 }) + 30);
          ensureSpace(warningHeight + 10);
          const warningY = doc.y;
          doc.roundedRect(54, warningY, contentWidth, warningHeight, 9).fillAndStroke(COLORS.amberPale, '#fde68a');
          drawWarningIcon(doc, 70, warningY + 17);
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.red).text(warningText, 102, warningY + 17, {
            width: contentWidth - 64,
            lineGap: 3,
          });
          doc.y = warningY + warningHeight + 10;
        });
      }

      ensureSpace(105);
      doc.moveDown(0.8);
      const disclaimerY = doc.y;
      doc.roundedRect(54, disclaimerY, contentWidth, 79, 10).fill('#f3f4f6');
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink).text('IMPORTANT SAFETY NOTE', 70, disclaimerY + 15);
      doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.muted).text(
        "NuskhaSaathi explains an existing prescription — it does not diagnose or replace your doctor's advice. Always consult your healthcare provider.",
        70,
        disclaimerY + 34,
        { width: contentWidth - 32, lineGap: 3 }
      );

      drawFooter(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

router.get('/:prescriptionId', verifyToken, async (req, res) => {
  try {
    const prescriptionResult = await pool.query(
      'SELECT * FROM prescriptions WHERE id = $1 AND user_id = $2',
      [req.params.prescriptionId, req.user.id]
    );

    if (prescriptionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Prescription not found.' });
    }

    const prescription = prescriptionResult.rows[0];
    const [medicinesResult, interactionsResult] = await Promise.all([
      pool.query(
        'SELECT * FROM medicines WHERE prescription_id = $1 ORDER BY created_at',
        [prescription.id]
      ),
      pool.query(
        'SELECT * FROM interaction_flags WHERE prescription_id = $1 ORDER BY created_at',
        [prescription.id]
      ),
    ]);

    const pdfBuffer = await buildReport({
      prescription,
      medicines: medicinesResult.rows,
      interactions: interactionsResult.rows,
      patientName: req.user.name,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="NuskhaSaathi-Report-${prescription.id}.pdf"`,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'private, no-store',
    });
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF report generation error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to generate prescription report.' });
    }
    return res.end();
  }
});

module.exports = router;
