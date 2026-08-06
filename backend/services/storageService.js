// Services: penyimpanan file + ETL orchestration. Extract dari routes/process.js
// supaya bisa dipakai bersama REST routes dan MCP tools.
const path = require('path');
const fs = require('fs');
const { processInputFiles } = require('../engine/process-input');
const { bulkImport } = require('../engine/bulk-import');
const { generateAllReports } = require('../report-generators');
const { supabase } = require('../supabase-client');

const isServerless = process.env.K_SERVICE || process.env.VERCEL;
const baseDir = isServerless ? '/tmp' : path.join(__dirname, '..', '..');
const inputDir = isServerless ? '/tmp' : path.join(baseDir, 'penyimpanan');
const inputTrashDir = isServerless ? '/tmp/trash' : path.join(baseDir, 'penyimpanan-trash');
const outputDir = isServerless ? '/tmp' : path.join(baseDir, 'output-app');
const sampleOutputDir = isServerless ? '/tmp' : path.join(baseDir, 'output');

function ensureDirs() {
  for (const d of [inputTrashDir, inputDir, outputDir]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

async function syncExcelFilesFromSupabase() {
  const { data, error } = await supabase.storage.from('pdam-storage').list('excel');
  if (error) return;
  if (!fs.existsSync(inputDir)) fs.mkdirSync(inputDir, { recursive: true });
  for (const f of data || []) {
    if (f.name === '.emptyFolderPlaceholder' || !/\.xlsx?$/i.test(f.name)) continue;
    const { data: fileData, error: dlError } = await supabase.storage.from('pdam-storage').download(`excel/${f.name}`);
    if (fileData && !dlError) {
      const buffer = Buffer.from(await fileData.arrayBuffer());
      fs.writeFileSync(path.join(inputDir, f.name), buffer);
    }
  }
}

async function listInputFiles() {
  const { data, error } = await supabase.storage.from('pdam-storage').list('excel');
  if (error) throw new Error('Gagal list Supabase: ' + error.message);
  return (data || [])
    .filter(f => f.name !== '.emptyFolderPlaceholder' && /\.xlsx?$/i.test(f.name))
    .map(f => ({
      filename: f.name,
      size: f.metadata ? f.metadata.size : 0,
      modified: f.created_at,
      downloadUrl: `/api/process/download-input/${encodeURIComponent(f.name)}`
    }));
}

async function downloadInputFile(db, filename) {
  const { data, error } = await supabase.storage.from('pdam-storage').download(`excel/${filename}`);
  if (error) return { error: 'File tidak ditemukan di Supabase' };
  return { buffer: Buffer.from(await data.arrayBuffer()), filename };
}

async function uploadInputFile(db, filename, contentBase64) {
  if (!filename || !contentBase64) return { error: 'Nama file dan konten base64 wajib diisi' };
  const cleanBase64 = contentBase64.replace(/^data:.*;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  const { error } = await supabase.storage.from('pdam-storage').upload(`excel/${filename}`, buffer, { upsert: true });
  if (error) return { error: error.message };
  if (!fs.existsSync(inputDir)) fs.mkdirSync(inputDir, { recursive: true });
  fs.writeFileSync(path.join(inputDir, filename), buffer);
  return { message: 'File berhasil diunggah ke Supabase', filename, size: buffer.length, buffer };
}

async function uploadMultipleInputFiles(db, files) {
  if (!Array.isArray(files) || files.length === 0) {
    return { error: 'Tidak ada file yang dikirim' };
  }
  const results = [];
  for (const file of files) {
    const cleanBase64 = file.contentBase64.replace(/^data:.*;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const { error } = await supabase.storage.from('pdam-storage').upload(`excel/${file.filename}`, buffer, { upsert: true });
    if (error) {
      results.push({ filename: file.filename, size: buffer.length, status: 'ERROR', message: error.message });
    } else {
      results.push({ filename: file.filename, size: buffer.length, status: 'OK' });
    }
  }
  return { message: `${results.length} file berhasil diunggah`, files: results };
}

async function deleteInputFile(db, filename) {
  // 1. Hapus jurnal + transaksi terkait file
  const jurnalResult = await db.queryRun('DELETE FROM jurnal WHERE transaksi_id IN (SELECT id FROM transaksi WHERE sumber = ?)', [filename]);
  const jurnalDeleted = jurnalResult ? jurnalResult.rowCount : 0;
  const txResult = await db.queryRun('DELETE FROM transaksi WHERE sumber = ?', [filename]);
  const txDeleted = txResult ? txResult.rowCount : 0;
  // 2. Hapus dari Supabase Storage
  const { error: rmError } = await supabase.storage.from('pdam-storage').remove([`excel/${filename}`]);
  if (rmError) return { error: 'Gagal menghapus file dari Supabase Storage: ' + rmError.message };
  // 3. Hapus file lokal
  const filePath = path.join(inputDir, filename);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (e) {}
  }
  return { message: `File "${filename}" berhasil dihapus permanen.`, deleted: true, dbDeleted: { transaksi: txDeleted, jurnal: jurnalDeleted } };
}

async function deleteAllInput(db) {
  const { data: storageFiles, error: listError } = await supabase.storage.from('pdam-storage').list('excel');
  if (listError) throw new Error('Gagal list Supabase: ' + listError.message);
  const filenames = (storageFiles || [])
    .filter(f => f.name !== '.emptyFolderPlaceholder' && /\.xlsx?$/i.test(f.name))
    .map(f => f.name);
  await db.queryRun('DELETE FROM jurnal');
  await db.queryRun('DELETE FROM transaksi');
  const deleteResults = [];
  for (const fname of filenames) {
    const { error } = await supabase.storage.from('pdam-storage').remove([`excel/${fname}`]);
    deleteResults.push({ file: fname, success: !error, error: error?.message });
  }
  if (fs.existsSync(inputDir)) {
    const localFiles = fs.readdirSync(inputDir).filter(f => /\.xlsx?$/i.test(f));
    for (const f of localFiles) {
      try { fs.unlinkSync(path.join(inputDir, f)); } catch (e) {}
    }
  }
  const failed = deleteResults.filter(r => !r.success);
  return { message: `Berhasil menghapus ${filenames.length - failed.length} dari ${filenames.length} file input.`, count: filenames.length, failed };
}

function listTrash(db) {
  if (!fs.existsSync(inputTrashDir)) return [];
  return fs.readdirSync(inputTrashDir)
    .filter(f => /\.xlsx?$/i.test(f))
    .map(f => {
      const stat = fs.statSync(path.join(inputTrashDir, f));
      return { filename: f, size: stat.size, modified: stat.mtime };
    });
}

async function restoreTrash(db, filename) {
  const trashPath = path.join(inputTrashDir, filename);
  const inputPath = path.join(inputDir, filename);
  if (!fs.existsSync(trashPath)) return { error: 'File tidak ditemukan di tempat sampah' };
  if (!fs.existsSync(inputDir)) fs.mkdirSync(inputDir, { recursive: true });
  fs.renameSync(trashPath, inputPath);
  const buffer = fs.readFileSync(inputPath);
  await supabase.storage.from('pdam-storage').upload(`excel/${filename}`, buffer, { upsert: true });
  return { message: 'File berhasil dipulihkan ke folder input' };
}

async function deleteTrash(db, filename) {
  const trashPath = path.join(inputTrashDir, filename);
  await db.queryRun('DELETE FROM jurnal WHERE transaksi_id IN (SELECT id FROM transaksi WHERE sumber = ?)', [filename]);
  await db.queryRun('DELETE FROM transaksi WHERE sumber = ?', [filename]);
  await db.queryRun('DELETE FROM jurnal WHERE transaksi_id NOT IN (SELECT id FROM transaksi)');
  const { error: rmError } = await supabase.storage.from('pdam-storage').remove([`excel/${filename}`]);
  if (rmError) console.error('Failed to remove from Supabase in delete-trash:', rmError);
  if (fs.existsSync(trashPath)) fs.unlinkSync(trashPath);
  return { message: 'File dan seluruh data terkait dihapus permanen.', deleted: true };
}

function listOutputFiles() {
  const targetDir = fs.existsSync(outputDir) ? outputDir : null;
  if (!targetDir) return [];
  return fs.readdirSync(targetDir)
    .filter(f => /\.xlsx?$/i.test(f))
    .map(f => {
      const stat = fs.statSync(path.join(targetDir, f));
      return { filename: f, size: stat.size, modified: stat.mtime, downloadUrl: `/api/process/download/${encodeURIComponent(f)}` };
    });
}

function resolveOutputFile(filename) {
  let filePath = path.join(sampleOutputDir, filename);
  if (!fs.existsSync(filePath)) filePath = path.join(outputDir, filename);
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

async function runEtl(db, whitelist) {
  await syncExcelFilesFromSupabase();
  if (Array.isArray(whitelist) && whitelist.length > 0) {
    const localFiles = fs.readdirSync(inputDir).filter(f => /\.xlsx?$/i.test(f));
    const missing = whitelist.filter(f => !localFiles.includes(f));
    if (missing.length) return { error: `Requested file(s) not found after sync: ${missing.join(', ')}` };
    for (const f of localFiles) {
      if (!whitelist.includes(f)) {
        try { fs.unlinkSync(path.join(inputDir, f)); } catch (e) {}
      }
    }
  }
  const result1 = await processInputFiles(db, inputDir);
  const result2 = await bulkImport(db, inputDir);
  return {
    files_processed: [...result1.files_processed, ...result2.files_processed],
    transactions: [...result1.transactions, ...result2.transactions],
    errors: [...result1.errors, ...result2.errors]
  };
}

async function generateReports(db, exportDate) {
  const results = await generateAllReports(db, outputDir, exportDate);
  return { output_dir: outputDir, results };
}

async function runBulkImport(db) {
  await syncExcelFilesFromSupabase();
  const result = await bulkImport(db, inputDir);
  return result;
}

async function runAll(db, exportDate) {
  await syncExcelFilesFromSupabase();
  const bulkResult = await bulkImport(db, inputDir);
  const processResult = await processInputFiles(db, inputDir);
  const reportResults = await generateAllReports(db, outputDir, exportDate);
  return { bulk: bulkResult, process: processResult, reports: reportResults };
}

async function previewFile(db, source, filename, maxRows) {
  let filePath;
  if (source === 'input') {
    filePath = path.join(inputDir, filename);
    if (!fs.existsSync(filePath)) {
      const { data, error } = await supabase.storage.from('pdam-storage').download(`excel/${filename}`);
      if (data && !error) {
        const buffer = Buffer.from(await data.arrayBuffer());
        if (!fs.existsSync(inputDir)) fs.mkdirSync(inputDir, { recursive: true });
        fs.writeFileSync(filePath, buffer);
      }
    }
  } else {
    filePath = path.join(outputDir, filename);
    if (!fs.existsSync(filePath)) filePath = path.join(sampleOutputDir, filename);
  }
  if (!fs.existsSync(filePath)) return { error: 'File tidak ditemukan: ' + filename };

  const XLSX = require('xlsx-js-style');
  const wb = XLSX.readFile(filePath, { type: 'buffer' });
  const sheets = {};
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const rows = [];
    const totalRows = Math.min(range.e.r + 1, maxRows);
    for (let r = 0; r < totalRows; r++) {
      const row = [];
      for (let c = 0; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        let val = cell ? cell.v : null;
        if (cell && cell.t === 'd' && cell.w) val = cell.w;
        if (val === undefined || val === null) val = null;
        row.push(val);
      }
      rows.push(row);
    }
    sheets[sheetName] = { rows, totalRows: range.e.r + 1, totalCols: range.e.c + 1, hasMore: range.e.r + 1 > maxRows };
  }
  return { filename, sheetNames: wb.SheetNames, sheets, totalSheets: wb.SheetNames.length };
}

module.exports = {
  ensureDirs, syncExcelFilesFromSupabase,
  listInputFiles, downloadInputFile, uploadInputFile, uploadMultipleInputFiles,
  deleteInputFile, deleteAllInput,
  listTrash, restoreTrash, deleteTrash,
  listOutputFiles, resolveOutputFile,
  runEtl, generateReports, runBulkImport, runAll,
  previewFile,
  inputDir, outputDir, sampleOutputDir, inputTrashDir
};