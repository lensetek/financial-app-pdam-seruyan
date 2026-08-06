const express = require('express');
const path = require('path');
const fs = require('fs');
const storageService = require('../services/storageService');
const { listAuditLogs } = require('../services/auditService');

module.exports = function (db) {
  const router = express.Router();
  const { inputDir, outputDir, sampleOutputDir, inputTrashDir } = storageService;
  storageService.ensureDirs();

  router.delete('/delete-input/:filename', async (req, res) => {
    try {
      const fname = decodeURIComponent(req.params.filename);
      const result = await storageService.deleteInputFile(db, fname);
      if (result.error) return res.status(500).json({ error: result.error });
      res.json(result);
    } catch (err) {
      console.error('[DELETE] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/delete-all-input', async (req, res) => {
    try {
      const result = await storageService.deleteAllInput(db);
      res.json(result);
    } catch (err) {
      console.error('[DELETE-ALL] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/trash-files', async (req, res) => {
    try {
      res.json(storageService.listTrash(db));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/restore-trash/:filename', async (req, res) => {
    try {
      const fname = decodeURIComponent(req.params.filename);
      const result = await storageService.restoreTrash(db, fname);
      if (result.error) return res.status(404).json({ error: result.error });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/delete-trash/:filename', async (req, res) => {
    try {
      const fname = decodeURIComponent(req.params.filename);
      const result = await storageService.deleteTrash(db, fname);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/input-files', async (req, res) => {
    try {
      res.json(await storageService.listInputFiles());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/download-input/:filename', async (req, res) => {
    try {
      const fname = decodeURIComponent(req.params.filename);
      const result = await storageService.downloadInputFile(db, fname);
      if (result.error) return res.status(404).send(result.error);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
      res.send(result.buffer);
    } catch (err) {
      res.status(500).send('Error downloading file: ' + err.message);
    }
  });

  router.get('/output-files', async (req, res) => {
    try {
      res.json(storageService.listOutputFiles());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/audit-logs', async (req, res) => {
    try {
      res.json(await listAuditLogs(db));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/download/:filename', async (req, res) => {
    try {
      const fname = decodeURIComponent(req.params.filename);
      const filePath = storageService.resolveOutputFile(fname);
      if (!filePath) return res.status(404).send('File tidak ditemukan');
      res.download(filePath, fname);
    } catch (err) {
      res.status(500).send('Error downloading file: ' + err.message);
    }
  });

  router.get('/download-pdf/:filename', async (req, res) => {
    try {
      const PdfPrinter = require('pdfmake');
      const XLSX = require('xlsx-js-style');
      const fname = decodeURIComponent(req.params.filename);

      let filePath = path.join(outputDir, fname);
      if (!fs.existsSync(filePath)) filePath = path.join(sampleOutputDir, fname);
      if (!fs.existsSync(filePath)) return res.status(404).send('File tidak ditemukan');

      const workbook = XLSX.readFile(filePath);
      const content = [];
      for (let si = 0; si < workbook.SheetNames.length; si++) {
        const sheetName = workbook.SheetNames[si];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (si > 0) content.push({ text: '', pageBreak: 'before' });
        content.push({ text: sheetName, fontSize: 11, bold: true, color: '#1e3a8a', margin: [0, 0, 0, 6] });
        if (rows.length === 0) {
          content.push({ text: '(Tidak ada data)', italics: true, color: '#888', margin: [0, 0, 0, 10] });
          continue;
        }
        const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
        if (maxCols === 0) continue;
        const tableBody = rows.map((row, ri) => {
          const cells = [];
          for (let ci = 0; ci < maxCols; ci++) {
            const cell = row[ci];
            let displayText = '';
            if (cell !== null && cell !== undefined && cell !== '') {
              if (typeof cell === 'number') {
                displayText = Number.isInteger(cell)
                  ? new Intl.NumberFormat('id-ID').format(cell)
                  : new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cell);
              } else {
                displayText = String(cell);
              }
            }
            const isHeader = ri === 0;
            cells.push({ text: displayText, fontSize: 6.5, bold: isHeader, fillColor: isHeader ? '#1e40af' : (ri % 2 === 0 ? '#f0f4ff' : '#ffffff'), color: isHeader ? '#ffffff' : '#111827', margin: [2, 2, 2, 2] });
          }
          return cells;
        });
        content.push({ table: { headerRows: 1, widths: Array(maxCols).fill('*'), body: tableBody }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => '#d1d5db', paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 2, paddingBottom: () => 2 }, margin: [0, 0, 0, 16] });
      }

      const fonts = { Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } };
      const printer = new PdfPrinter(fonts);
      const docDef = {
        content,
        pageSize: 'A3',
        pageOrientation: 'landscape',
        pageMargins: [20, 30, 20, 30],
        defaultStyle: { font: 'Helvetica', fontSize: 7 },
        footer: (currentPage, pageCount) => ({ text: `PERUMDAM Tirta Seruyan  |  ${fname.replace('.xlsx', '')}  |  Halaman ${currentPage} dari ${pageCount}`, alignment: 'center', fontSize: 6, color: '#6b7280', margin: [0, 5, 0, 0] }),
        info: { title: fname.replace('.xlsx', ''), author: 'PERUMDAM Tirta Seruyan' }
      };
      const pdfName = fname.replace(/\.xlsx?$/i, '.pdf');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdfName}"`);
      const pdfDoc = printer.createPdfKitDocument(docDef);
      pdfDoc.pipe(res);
      pdfDoc.end();
    } catch (err) {
      res.status(500).send('Error generating PDF: ' + err.message);
    }
  });

  router.post('/upload-input', async (req, res) => {
    try {
      const { filename, contentBase64 } = req.body;
      const result = await storageService.uploadInputFile(db, filename, contentBase64);
      if (result.error) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/input', async (req, res) => {
    try {
      const { files } = req.body || {};
      const result = await storageService.runEtl(db, files);
      if (result.error) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/generate', async (req, res) => {
    try {
      const { exportDate } = req.body || {};
      res.json(await storageService.generateReports(db, exportDate));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/sync-firestore', async (req, res) => {
    try {
      const { syncToFirestore } = require('../engine/sync-firestore');
      const result = await syncToFirestore(db);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/bulk-import', async (req, res) => {
    try {
      res.json(await storageService.runBulkImport(db));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/run-all', async (req, res) => {
    try {
      const { exportDate } = req.body || {};
      res.json(await storageService.runAll(db, exportDate));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/preview/:source/:filename', async (req, res) => {
    try {
      const fname = decodeURIComponent(req.params.filename);
      const source = req.params.source;
      const maxRows = parseInt(req.query.rows) || 50;
      const result = await storageService.previewFile(db, source, fname, maxRows);
      if (result.error) return res.status(404).json({ error: result.error });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/upload-multiple', async (req, res) => {
    try {
      const { files } = req.body;
      const result = await storageService.uploadMultipleInputFiles(db, files);
      if (result.error) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};