// Registry MCP tools: definisi + role per tool + handler (wrap service functions).
// Role: 'viewer' | 'operator' | 'admin'.
const { z } = require('zod');
const akun = require('../services/akunService');
const transaksi = require('../services/transaksiService');
const laporan = require('../services/laporanService');
const stg = require('../services/storageService');
const reports = require('../services/reportsService');
const audit = require('../services/auditService');
const tokens = require('../services/tokenService');

const V = ['viewer', 'operator', 'admin'];

function tool(name, description, requiredRoles, inputShape, handler) {
  // Wrap shape jadi zod object → SDK convert ke JSON Schema proper.
  const inputSchema = inputShape ? z.object(inputShape) : z.object({});
  return { name, title: name, description, requiredRoles, inputSchema, handler };
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD').optional();

// Filter akun by tipe (optional)
async function listAkunFiltered(db, tipe) {
  if (tipe) return (await akun.listAkun(db)).filter(a => a.tipe === tipe);
  return akun.listAkun(db);
}

const tools = [
  // ===== Akun =====
  tool('list_akun', 'Daftar seluruh bagan akun (COA). Filter tipe: aset/kewajiban/ekuitas/pendapatan/beban.', V,
    { tipe: z.enum(['aset', 'kewajiban', 'ekuitas', 'pendapatan', 'beban']).optional(), type: z.string().optional() },
    async (db, args) => listAkunFiltered(db, args.tipe || args.type)),

  tool('get_akun', 'Ambil satu akun by id atau kode.', V,
    { id: z.number().int().optional(), kode: z.string().optional() },
    async (db, args) => {
      if (args.id === undefined && args.kode === undefined) return { error: 'Berikan id atau kode' };
      return await akun.getAkun(db, { id: args.id, kode: args.kode });
    }),

  // ===== Transaksi =====
  tool('list_transaksi', 'Daftar semua transaksi + rincian jurnal (menurun).', V,
    {},
    async (db) => transaksi.listTransaksi(db)),

  tool('get_transaksi', 'Ambil satu transaksi by id + rincian jurnal.', V,
    { id: z.number().int() },
    async (db, args) => transaksi.getTransaksi(db, args.id)),

  tool('create_transaksi', 'Buat transaksi double-entry. Butuh minimal 2 entries dan total debit = total kredit.', ['operator', 'admin'],
    {
      tanggal: dateStr,
      deskripsi: z.string().min(1),
      entries: z.array(z.object({ akun_id: z.number().int(), debit: z.number(), kredit: z.number() })).min(2)
    },
    async (db, args) => {
      const r = await transaksi.createTransaksi(db, args);
      return r.error ? { error: r.error } : r.data;
    }),

  tool('delete_transaksi', 'Hapus transaksi + jurnal by id.', ['operator', 'admin'],
    { id: z.number().int() },
    async (db, args) => transaksi.deleteTransaksi(db, args.id)),

  // ===== Laporan JSON =====
  tool('get_neraca_saldo', 'Neraca saldo semua akun (total debit/kredit + saldo normal-aware).', V,
    {},
    async (db) => laporan.getNeracaSaldo(db)),
  tool('get_laba_rugi', 'Laporan laba rugi (pendapatan, beban, laba bersih).', V,
    {},
    async (db) => laporan.getLabaRugi(db)),
  tool('get_neraca', 'Laporan neraca (aset, kewajiban, ekuitas + laba berjalan).', V,
    {},
    async (db) => laporan.getNeraca(db)),

  // ===== Laporan XLSX =====
  tool('generate_all_reports', 'Generate seluruh 5 laporan XLSX (jurnal, buku besar, neraca lajur, keuangan, audit trail). Return path output.', ['operator', 'admin'],
    { export_date: dateStr },
    async (db, args) => reports.generate(db, 'all', args.export_date)),
  tool('generate_journal', '[LAPORAN] Generate laporan Jurnal XLSX.', ['operator', 'admin'],
    { export_date: dateStr },
    async (db, args) => reports.generate(db, 'journal', args.export_date)),
  tool('generate_buku_besar', '[LAPORAN] Generate laporan Buku Besar XLSX.', ['operator', 'admin'],
    { export_date: dateStr },
    async (db, args) => reports.generate(db, 'buku_besar', args.export_date)),
  tool('generate_neraca_lajur', '[LAPORAN] Generate laporan Neraca Lajur XLSX.', ['operator', 'admin'],
    { export_date: dateStr },
    async (db, args) => reports.generate(db, 'neraca_lajur', args.export_date)),
  tool('generate_financial_statements', '[LAPORAN] Generate laporan Neraca, Laba Rugi, Arus Kas, Ekuitas XLSX.', ['operator', 'admin'],
    { export_date: dateStr },
    async (db, args) => reports.generate(db, 'financial_statements', args.export_date)),
  tool('generate_audit_trail', '[LAPORAN] Generate laporan Audit Trail XLSX.', ['operator', 'admin'],
    { export_date: dateStr },
    async (db, args) => reports.generate(db, 'audit_trail', args.export_date)),

  // ===== Input / ETL =====
  tool('list_input_files', 'Daftar file Excel input (dari Supabase storage).', V,
    {},
    async (db) => stg.listInputFiles()),

  tool('upload_input_file', 'Upload file Excel input sebagai base64.', ['operator', 'admin'],
    { filename: z.string().min(1), content_base64: z.string().min(10) },
    async (db, args) => stg.uploadInputFile(db, args.filename, args.content_base64)),

  tool('run_etl_process', 'Proses ETL: parse file input (DRD/LPP) jadi jurnal double-entry. Opsional filter by filename.', ['operator', 'admin'],
    { files: z.array(z.string()).optional() },
    async (db, args) => stg.runEtl(db, args.files)),

  tool('run_all', 'Jalankan pipeline penuh: sync + ingest file + ETL + generate semua laporan.', ['operator', 'admin'],
    { export_date: dateStr },
    async (db, args) => stg.runAll(db, args.export_date)),

  // ===== Output =====
  tool('list_output_files', 'Daftar laporan XLSX yang sudah dihasilkan di folder output.', V,
    {},
    async (db) => stg.listOutputFiles()),
  tool('download_output_file', 'Download laporan XLSX output sebagai base64 (client simpan jadi .xlsx).', V,
    { filename: z.string().min(1) },
    async (db, args) => {
      const fs = require('fs');
      const filePath = stg.resolveOutputFile(args.filename);
      if (!filePath) return { error: 'File tidak ditemukan: ' + args.filename };
      const data = fs.readFileSync(filePath);
      return { filename: args.filename, size: data.length, content_base64: data.toString('base64') };
    }),

  // ===== Audit =====
  tool('list_audit_logs', 'Riwayat audit log (default 200 terakhir).', V,
    { limit: z.number().int().optional() },
    async (db, args) => audit.listAuditLogs(db, (args && args.limit) || 200)),
  tool('list_login_sessions', 'Riwayat sesi login (default 50 terakhir).', V,
    { limit: z.number().int().optional() },
    async (db, args) => audit.listLoginSessions(db, (args && args.limit) || 50)),

  // ===== Token admin =====
  tool('create_mcp_token', '[ADMIN] Buat token MCP baru. Plaintext token dikembalikan SEKALI.', ['admin'],
    { name: z.string().min(1), roles: z.array(z.enum(['viewer', 'operator', 'admin'])).optional(), expires_in_days: z.number().int().optional(), notes: z.string().optional() },
    async (db, args, authInfo) => {
      const info = authInfo || {};
      return tokens.createToken(db, { ...args, actor: info.email || info.id || 'mcp' });
    }),

  tool('list_mcp_tokens', '[ADMIN] Daftar semua token MCP yang terdaftar.', ['admin'],
    {},
    async (db) => tokens.listTokens(db)),

  tool('revoke_mcp_token', '[ADMIN] Revoke (soft) token MCP by id.', ['admin'],
    { token_id: z.number().int() },
    async (db, args, authInfo) => {
      const info = authInfo || {};
      return tokens.revokeToken(db, args.token_id, info.email || info.id || 'mcp');
    }),

  tool('extend_mcp_token', '[ADMIN] Perpanjang masa berlaku token by id.', ['admin'],
    { token_id: z.number().int(), days: z.number().int().min(1) },
    async (db, args) => tokens.extendToken(db, args.token_id, args.days)),

  tool('delete_mcp_token', '[ADMIN] Hard-delete token MCP by id.', ['admin'],
    { token_id: z.number().int() },
    async (db, args) => tokens.deleteToken(db, args.token_id)),
];

module.exports = { tools, V };