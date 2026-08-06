// Services: generate laporan XLSX. Wrap report-generators supaya dipakai routes + MCP.
// Return shape konsisten: { output_dir, name, file, status, results? }
const path = require('path');
const { generateAllReports } = require('../report-generators');
const { generateJournal } = require('../report-generators/journal-report');
const { generateBukuBesar } = require('../report-generators/buku-besar-report');
const { generateNeracaLajur } = require('../report-generators/neraca-lajur-report');
const { generateFinancialStatements } = require('../report-generators/financial-statements');
const { generateAuditTrail } = require('../report-generators/audit-trail-report');
const { outputDir } = require('./storageService');

const REPORT_MAP = {
  all: { fn: generateAllReports, file: null, label: 'SEMUA LAPORAN' },
  journal: { fn: generateJournal, file: 'JOURNAL.xlsx', label: 'Jurnal' },
  buku_besar: { fn: generateBukuBesar, file: 'BUKU BESAR.xlsx', label: 'Buku Besar' },
  neraca_lajur: { fn: generateNeracaLajur, file: 'NERACA LAJUR.xlsx', label: 'Neraca Lajur' },
  financial_statements: { fn: generateFinancialStatements, file: 'NERACA, RL, ARUS KAS.xlsx', label: 'Laporan Keuangan' },
  audit_trail: { fn: generateAuditTrail, file: 'AUDIT_TRAIL.xlsx', label: 'Audit Trail' },
};

async function generate(db, name, exportDate) {
  const def = REPORT_MAP[name];
  if (!def) throw new Error('Laporan tidak dikenal: ' + name);
  try {
    if (name === 'all') {
      const results = await def.fn(db, outputDir, exportDate);
      return { output_dir: outputDir, name, label: def.label, status: results.some(r => r.status === 'ERROR') ? 'PARTIAL' : 'OK', results };
    }
    // Per-laporan: fungsi terima (db, filePath, exportDate) → return path
    const filePath = path.join(outputDir, def.file);
    const writtenPath = await def.fn(db, filePath, exportDate);
    return { output_dir: outputDir, name, label: def.label, file: path.basename(writtenPath || filePath), status: 'OK' };
  } catch (err) {
    return { output_dir: outputDir, name, label: def.label, status: 'ERROR', error: err.message };
  }
}

module.exports = { generate, REPORT_MAP };