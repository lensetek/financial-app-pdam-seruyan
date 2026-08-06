# PDAM Tirta Seruyan - Sistem Keuangan Digital

Sistem pengolahan data keuangan digital untuk **Perusahaan Umum Daerah Air Minum (PERUMDAM) Tirta Seruyan, Kabupaten Seruyan**. Aplikasi ini mengotomasi alur dari input Excel rekening air & pembayaran menjadi laporan keuangan lengkap (Jurnal, Buku Besar, Neraca Lajur, Neraca, Laba Rugi, Arus Kas) secara instan.

---

## Apa Yang Dilakukan Aplikasi Ini

```
 11 File Excel Input (DRD, LPP, Voucher, Jurnal Bayar, dsb.)
         │
         ▼
 ┌──────────────────┐
 │   PROSES ETL     │  Parser otomatis → database SQLite
 │  (Extract,       │  Double-entry journal (debit/kredit seimbang)
 │   Transform,     │  Audit trail berbasis SHA-256 hash chaining
 │   Load)          │
 └──────────────────┘
         │
         ▼
 6 File Excel Output (Jurnal, Buku Besar, Neraca Lajur,
                       Neraca/RL/Arus Kas, Audit Trail, Kompilasi)
```

---

## Arsitektur

| Komponen | Teknologi | Lokasi |
|----------|-----------|--------|
| Frontend | React + Vite | `frontend/` |
| Backend | Node.js + Express | `backend/` |
| Database | SQLite (sql.js) | `backend/finance.db` |
| Hosting | Firebase Hosting + Cloud Functions | `firebase.json` |
| Backup | Firebase Firestore (opsional) | `backend/engine/sync-firestore.js` |

**Port:** 3000 (production), API & frontend disajikan dari Express yang sama.

---

## Alur Data Lengkap

### 1. Input (11 File Excel)

| File | Jenis Data | Yang Di-parse |
|------|-----------|---------------|
| `rekap drd 04-2026.xls` | Daftar Rekening Dagang | Golongan tarif, harga air, jasa admin, dana meter |
| `LPP tgl 18 mei (loket kantor).xls` | Laporan Penerimaan Pembayaran | Total penerimaan kas dari loket kantor |
| `LPP tgl 18 mei (loket cabang).xls` | Laporan Penerimaan Pembayaran | Total penerimaan kas dari loket cabang |
| `LPP tgl 18 mei (koperasi).xls` | Laporan Penerimaan Pembayaran | Total penerimaan kas dari koperasi |
| `LPP tgl 18 mei REKAP USER.xls` | Rekap LPP | Ringkasan penerimaan seluruh user |
| `Daftar Voucher.xlsx` | Daftar Voucher Utang Dibayar | Voucher pembayaran dengan kode akun debet/kredit |
| `Jurnal Bayar.xlsx` | Jurnal Bayar Kas | Pencatatan kas keluar untuk utang |
| `AKSESORIES.xls` | Persediaan Aksesories | Total nilai aksesories & water meter |
| `Persediaan Bahan Kimia & BBM.xlsx` | Persediaan Bahan Kimia | Total nilai bahan kimia & BBM |
| `AKTIVA TETAP 202 PENYUSUTAN.xls` | Aktiva Tetap | Data penyusutan aset (template) |
| `Realisasi Anggaran.xlsx` | Realisasi Anggaran | Neraca komparatif (template) |

### 2. Proses ETL

**DRD (Daftar Rekening Dagang):**
```
Input: Golongan tarif + harga air per golongan
  │
  ├─ Debit  13.01.00  Piutang Usaha          (= harga air + jasa admin)
  ├─ Kredit 81.01.10  Pendapatan Harga Air   (= harga air)
  └─ Kredit 81.01.20  Pendapatan Administrasi (= jasa admin + dana meter)
```

**LPP (Laporan Penerimaan Pembayaran):**
```
Input: Total penerimaan kas dari loket/koperasi
  │
  ├─ Debit  11.01.00  Kas                     (= total terima)
  ├─ Kredit 13.01.00  Piutang Usaha           (= total air + admin)
  └─ Kredit 81.02.50  Pendapatan Denda        (= total denda, jika ada)
```

**Daftar Voucher (DVUD):**
```
Input: Voucher pembayaran utang
  │
  ├─ Debit  [akun sesuai kode debet voucher]
  └─ Kredit [akun sesuai kode kredit voucher]
```

**Jurnal Bayar (JBK):**
```
Input: Catatan kas keluar untuk utang
  │
  ├─ Debit  50.01.00  Utang Usaha
  ├─ Debit  50.01.01  Utang Non-Usaha
  └─ Kredit 11.01.00  Kas
```

**Persediaan (Aksesories & Bahan Kimia):**
```
Input: Total nilai persediaan dari file Excel
  │
  ├─ Debit  15.01.00  Persediaan Bahan Kimia   (atau 15.03.00 untuk aksesories)
  └─ Kredit 71.01.00  Kekayaan Pemda Dipisahkan
```

### 3. Database (SQLite)

Tiga tabel utama dengan sistem double-entry bookkeeping:

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│    akun      │     │  transaksi   │     │    jurnal     │
│  (61 akun)   │◄────│  (tanggal,   │────►│  (akun_id,    │
│  kode, nama, │     │   deskripsi, │     │   debit,      │
│  tipe, saldo │     │   sumber)    │     │   kredit)     │
└─────────────┘     └──────────────┘     └───────────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │   audit_log     │
                                          │  (SHA-256 hash  │
                                          │   chaining)     │
                                          └─────────────────┘
```

- **akun**: 61 akun COA sesuai standar PDAM (aset, kewajiban, ekuitas, pendapatan, beban)
- **transaksi**: Setiap transaksi mencatat tanggal, deskripsi, dan sumber file
- **jurnal**: Entri debet & kredit (sistem double-entry, debet harus = kredit)
- **audit_log**: Setiap operasi dicatat dengan hash SHA-256 yang saling terhubung (tamper-evident)

### 4. Output (6 File Excel)

| File Output | Isi | Jumlah Sheet |
|-------------|-----|:------------:|
| **Journal 2026.xlsx** | Jurnal umum, bukti penerimaan, voucher utang, jurnal kas, jurnal koreksi, jurnal pembalik | 20 |
| **BUKU BESAR 2026.xlsx** | Buku besar per kelompok akun (11.01-12.01, 13.00, 15.00, 81.01, 91.00, dst.) | 19 |
| **Neraca Lajur 2026.xlsx** | Neraca lajur bulanan (Januari - Mei) dengan saldo awal, mutasi, saldo akhir, rugi/laba | 5 |
| **Neraca, RL, Arus Kas.xlsx** | Laba Rugi ETAP, Laba Rugi OTDA, Neraca, Arus Kas, Ekuitas, Komparatif, P-9/P-10/P-11 | 20 |
| **AUDIT_TRAIL.xlsx** | Input file map, jurnal audit, output file map, COA usage, ringkasan | 6 |
| **Kompilasi Seluruh Laporan.xlsx** | Gabungan seluruh sheet dari 5 file di atas | 70+ |

---

## Standar Akuntansi

Aplikasi mengikuti standar:
- **SAK ETAP** (Standar Akuntansi Keuangan Entitas Tanpa Akuntabilitas Publik)
- **SAK OTDA** (Otonomi Daerah)
- **PERMENDAGRI** tentang PDAM
- Struktur COA mengikuti panduan khusus PDAM: Aset Lancar (11-16), Aset Tetap (31-35), Utang (50), Ekuitas (71-77), Pendapatan (81), Beban (91-98)

---

## Fitur Aplikasi

### Backend
- **ETL Otomatis**: Upload file Excel → proses otomatis → jurnal debet/kredit
- **Double-Entry Bookkeeping**: Setiap transaksi selalu seimbang (total debit = total kredit)
- **Audit Trail Kriptografi**: Hash chaining SHA-256 untuk integritas data
- **Multi-format Export**: Download output dalam format XLSX atau PDF
- **Preview Excel**: Lihat isi file Excel sebelum download (semua sheet & baris)
- **File Management**: Upload, hapus (dengan tempat sampah), pulihkan file input

### Frontend
- **Dashboard**: KPI keuangan, grafik pendapatan vs beban, ringkasan aset/kewajiban/ekuitas
- **Transaksi**: Entri jurnal manual dengan validasi debet = kredit
- **Laba Rugi**: Laporan pendapatan & beban per akun
- **Neraca**: Laporan posisi keuangan (aset = kewajiban + ekuitas)
- **Proses**: Jalankan pipeline ETL, kelola file input/output
- **Riwayat Audit**: Log audit dengan hash verifikasi

---

## Cara Menjalankan

### Prasyarat
- Node.js 18+
- npm

### Instalasi
```bash
npm install
cd frontend && npm install && cd ..
```

### Build Frontend
```bash
cd frontend && npx vite build && cd ..
```

### Jalankan Server
```bash
npm start
```
Server berjalan di `http://localhost:3000`.

## MCP Server (Model Context Protocol)

Aplikasi mengekspos seluruh proses bisnis sebagai **MCP server** (Streamable HTTP) di `/mcp`. Client seperti **Claude Desktop**, **Cursor**, atau agent lain bisa memanggil tool MCP dengan cukup **URL + bearer token** sesuai role.

### Transport

- URL: `http://localhost:3000/mcp` (production pakai HTTPS host kamu)
- Metode: `POST`/`GET`/`DELETE` (Streamable HTTP, protokol MCP `2024-11-05`)

### Aktifkan

Set variabel env di `.env`:

```
MCP_ENABLED=true            # false → /mcp return 503
ADMIN_TOKEN=<random>        # fallback bootstrap admin (opsional; auth utama sedot Supabase JWT role=admin)
MCP_RATE_LIMIT_PER_MIN=60
```

### Buat Token

1. Login ke web app → menu **Token MCP** (sudah di-hide di nav, tekan di dashboard).
   > Butuh role `admin` di Supabase (rekomendasi di bawah) atau `ADMIN_TOKEN`.
2. Klik **+ Buat Token** → isi nama + role (`viewer`/`operator`/`admin`) + masa berlaku hari.
3. Salin **plaintext token** — hanya tampil sekali.
4. Pasang di client:

   ```json
   // ~/.config/Claude/claude_desktop_config.json
   { "mcpServers": {
     "pdam": {
       "url": "http://localhost:3000/mcp",
       "headers": { "Authorization": "Bearer <TOKEN>" }
     }
   } }
   ```

### Role & Tool

| Role | Akses |
|------|-------|
| `viewer` | list akun, laporan JSON, list files, download, audit read |
| `operator` | viewer + buat/hapus transaksi, generate laporan XLSX, upload file, run ETL/bulk/run_all, restore trash |
| `admin` | operator + delete trash permanent + kelola token (create/revoke/extend/delete) |

Pen filter dilakukan 2 lapis: `tools/list` (client hanya lihat tool yang diizinkan role) + runtime check di `tools/call` (anti bypass).

### Setup admin role di Supabase

Admin auth hybrid: kalau `ADMIN_TOKEN` terisi → gitu terima. Selain itu, verifikasi **Supabase JWT** dan cek `app_metadata.role === 'admin'`. Set sekali di SQL editor:

```sql
UPDATE auth.users
SET app_metadata = jsonb_set(app_metadata, '{role}', '"admin"')
WHERE email = '<email_admin>';
```

### Uji cepat (curl)

```bash
# 1. Handle initialize (ambil Mcp-Session-Id dari header)
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

# 2. List tools (pakai Mcp-Session-Id dari langkah 1)
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer <TOKEN>" -H "Mcp-Session-Id: <SID>" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

### Laporan XLSX

Report generator nulis file ke `output-app/` (local) atau `/tmp` (serverless). Tool `download_output_file` ambil file utk dikirim balik ke client. Lihat `backend/mcp/registry.js` untuk daftar lengkap tool.

### Deploy ke Firebase
```bash
firebase deploy
```

---

## Struktur Project

```
financial-app-pdam-seruyan/
├── backend/
│   ├── server.js              # Express server (port 3000)
│   ├── database.js            # SQLite schema + helpers
│   ├── coa-master.js          # 61 akun COA master
│   ├── engine/
│   │   ├── process-input.js   # Parser DRD & LPP
│   │   ├── bulk-import.js     # Parser voucher, jurnal bayar, persediaan
│   │   ├── coa-lookup.js      # Pencarian akun berdasarkan kode/nama
│   │   ├── saldo-helper.js    # Kalkulasi saldo debet/kredit
│   │   └── sync-firestore.js  # Sinkronisasi ke Firebase Firestore
│   ├── input-processors/
│   │   ├── drd-parser.js      # Parser Daftar Rekening Dagang
│   │   └── lpp-parser.js      # Parser Laporan Penerimaan Pembayaran
│   ├── report-generators/
│   │   ├── index.js           # Orchestrator laporan
│   │   ├── journal-report.js  # Generator jurnal (20 sheets)
│   │   ├── buku-besar-report.js  # Generator buku besar (19 sheets)
│   │   ├── neraca-lajur-report.js # Generator neraca lajur (5 sheets)
│   │   ├── financial-statements.js # Generator neraca/RL/arus kas (20 sheets)
│   │   └── audit-trail-report.js   # Generator audit trail (6 sheets)
│   └── routes/
│       ├── akun.js            # API: daftar akun
│       ├── transaksi.js       # API: CRUD transaksi
│       ├── laporan.js         # API: neraca saldo, laba rugi, neraca
│       └── process.js         # API: proses input, generate output, upload, preview
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Router & layout
│   │   ├── components/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── TransaksiPage.jsx
│   │   │   ├── LabaRugi.jsx
│   │   │   ├── Neraca.jsx
│   │   │   ├── ProcessPage.jsx
│   │   │   └── AuditTrailPage.jsx
│   │   ├── style.css          # Design system (CSS variables, responsive)
│   │   └── api.js             # API client
│   ├── dist/                  # Build output
│   └── .env.production        # VITE_API_URL config
├── input/                     # Directory file input aktif
├── output-app/                # Output yang di-generate
├── _Excel/                    # Sumber data & template
│   ├── input/                 # File DRD & LPP
│   ├── Input Baru/            # Voucher, Jurnal Bayar, Persediaan
│   └── E.g Laporan Keuangan/  # Template output referensi
├── firebase.json              # Firebase Hosting config
├── railway.json               # Railway deployment config
└── package.json               # Root scripts
```

---

## Deploy

| Platform | Config | Port |
|----------|--------|------|
| **Firebase** | `firebase.json` → Cloud Functions (asia-southeast2) + Hosting | 8080 |
| **Railway** | `railway.json` → Nixpacks builder | 3000 |
| **Lokal** | `npm start` | 3000 |

---

## Lisensi

Dibuat untuk **PERUMDAM Tirta Seruyan, Kabupaten Seruyan, Kalimantan Tengah**.
