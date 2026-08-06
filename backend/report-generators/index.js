const path = require('path');
const { generateJournal } = require('./journal-report');
const { generateBukuBesar } = require('./buku-besar-report');
const { generateNeracaLajur } = require('./neraca-lajur-report');
const { generateFinancialStatements } = require('./financial-statements');
const { generateAuditTrail } = require('./audit-trail-report');

const addTableStyles = (wb) => {
  const xlsxStyle = require('xlsx-js-style');
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws['!ref']) continue;
    const range = xlsxStyle.utils.decode_range(ws['!ref']);

    // Find where the table starts
    let tableStartRow = -1;
    for (let r = range.s.r; r <= Math.min(range.e.r, 15); r++) {
      let isHeaderRow = false;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = xlsxStyle.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && cell.v) {
          const v = String(cell.v).toUpperCase().trim();
          if (['NO', 'TGL', 'NOMOR DRD', 'VOUCHER', 'NO.', 'KODE', 'KETERANGAN', 'URAIAN', 'NAMA PELANGGAN'].includes(v)) {
            tableStartRow = r;
            isHeaderRow = true;
            break;
          }
        }
      }
      if (isHeaderRow) break;
    }

    if (tableStartRow === -1) tableStartRow = 6;

    for (let r = range.s.r; r <= range.e.r; r++) {
      // Check if row is a signature block
      let isSignatureRow = false;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = xlsxStyle.utils.encode_cell({ r, c });
        if (ws[addr] && ws[addr].v && typeof ws[addr].v === 'string') {
          const v = ws[addr].v;
          if (v.includes('Kuala Pembuang') || v.includes('Kasi.') || v.includes('TRI MURTIANI') || v.includes('Direktur')) {
            isSignatureRow = true;
            break;
          }
        }
      }

      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = xlsxStyle.utils.encode_cell({ r, c });
        if (!ws[addr]) continue;
        if (!ws[addr].s) ws[addr].s = {};

        if (r < tableStartRow || isSignatureRow) {
          ws[addr].s.font = { bold: true, name: 'Arial', sz: 11 };
          ws[addr].s.border = {}; // No border
          continue;
        }

        if (r >= tableStartRow) {
          ws[addr].s.border = {
            top: { style: 'thin', color: { auto: 1 } },
            bottom: { style: 'thin', color: { auto: 1 } },
            left: { style: 'thin', color: { auto: 1 } },
            right: { style: 'thin', color: { auto: 1 } }
          };
          ws[addr].s.font = { name: 'Arial', sz: 10 };

          if (r === tableStartRow) {
            ws[addr].s.font.bold = true;
            ws[addr].s.font.color = { rgb: "FFFFFF" };
            ws[addr].s.fill = { fgColor: { rgb: "4472C4" } };
            ws[addr].s.alignment = { horizontal: 'center', vertical: 'center' };
          } else {
            // Zebra striping
            if (r % 2 === (tableStartRow % 2 === 0 ? 1 : 0)) {
              ws[addr].s.fill = { fgColor: { rgb: "D9E1F2" } }; // Light blue for alternating rows
            } else {
              ws[addr].s.fill = { fgColor: { rgb: "FFFFFF" } }; // White for other rows
            }

            // Number formatting for numeric values
            if (typeof ws[addr].v === 'number') {
              ws[addr].z = '#,##0.00';
            }
          }
        }
      }
    }
  }
};

async function generateAllReports(db, outputDir, exportDate = null) {
  const fs = require('fs');
  const path = require('path');

  // Use current year as suffix for report file names

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  } else {
    // Clear old files
    const oldFiles = fs.readdirSync(outputDir);
    for (const f of oldFiles) {
      if (/\.xlsx?$/i.test(f)) {
        fs.unlinkSync(path.join(outputDir, f));
      }
    }
  }

  // If there are no transactions, skip generating reports – nothing to output
  // Postgres COUNT(*) returns a string ('0'), so coerce to number for the check.
  const txnCountRes = await db.queryOne('SELECT COUNT(*) as cnt FROM transaksi');
  const cnt = parseInt(txnCountRes && txnCountRes.cnt, 10) || 0;
  if (!cnt) {
    // No data – return empty result list (no files generated)
    return [];
  }

  const results = [];

  const jFile = 'JOURNAL.xlsx';
  try {
    await generateJournal(db, path.join(outputDir, jFile), exportDate);
    results.push({ file: jFile, status: 'OK' });
  } catch (e) { results.push({ file: jFile, status: 'ERROR', error: e.message }); }

  const bbFile = 'BUKU BESAR.xlsx';
  try {
    await generateBukuBesar(db, path.join(outputDir, bbFile), exportDate);
    results.push({ file: bbFile, status: 'OK' });
  } catch (e) { results.push({ file: bbFile, status: 'ERROR', error: e.message }); }

  const nlFile = 'NERACA LAJUR.xlsx';
  try {
    await generateNeracaLajur(db, path.join(outputDir, nlFile), exportDate);
    results.push({ file: nlFile, status: 'OK' });
  } catch (e) { results.push({ file: nlFile, status: 'ERROR', error: e.message }); }

  const fsFile = 'NERACA, RL, ARUS KAS.xlsx';
  try {
    await generateFinancialStatements(db, path.join(outputDir, fsFile), exportDate);
    results.push({ file: fsFile, status: 'OK' });
  } catch (e) { results.push({ file: fsFile, status: 'ERROR', error: e.message }); }

  const atFile = 'AUDIT_TRAIL.xlsx';
  try {
    await generateAuditTrail(db, path.join(outputDir, atFile), exportDate);
    results.push({ file: atFile, status: 'OK' });
  } catch (e) { results.push({ file: atFile, status: 'ERROR', error: e.message }); }

  // Rename generated files to all‑uppercase, year‑less names for the final output set
  const renameMap = {
    'BUKU BESAR 2026.xlsx': 'BUKU BESAR.xlsx',
    'Journal 2026.xlsx': 'JOURNAL.xlsx',
    'Neraca Lajur 2026.xlsx': 'NERACA LAJUR.xlsx',
    'Neraca, RL, Arus Kas.xlsx': 'NERACA, RL, ARUS KAS, EKUITAS & RINCIAN.xlsx',
    'AUDIT_TRAIL.xlsx': 'AUDIT_TRAIL.xlsx'
  };
  for (const [source, target] of Object.entries(renameMap)) {
    const sourcePath = path.join(outputDir, source);
    const targetPath = path.join(outputDir, target);
    if (source !== target && fs.existsSync(sourcePath)) {
      try {
        fs.renameSync(sourcePath, targetPath);
        // Also update the results entry so the API reflects the final name
        const r = results.find(r => r.file === source);
        if (r) r.file = target;
      } catch (e) {}
    }
  }

  return results;
}

module.exports = { generateAllReports, addTableStyles };
