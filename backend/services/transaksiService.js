// Services: transaksi + jurnal. Dipakai bersama oleh routes dan MCP tools.

async function listTransaksi(db) {
  const transaksi = await db.queryAll(`
    SELECT t.*, GROUP_CONCAT(
      '{"akun_id":' || j.akun_id || ',"akun_nama":"' || a.nama || '","debit":' || j.debit || ',"kredit":' || j.kredit || '}'
    ) as jurnal
    FROM transaksi t
    LEFT JOIN jurnal j ON j.transaksi_id = t.id
    LEFT JOIN akun a ON a.id = j.akun_id
    GROUP BY t.id
    ORDER BY t.id DESC
  `);
  return transaksi.map(t => ({
    ...t,
    jurnal: t.jurnal ? JSON.parse(`[${t.jurnal}]`) : []
  }));
}

async function getTransaksi(db, id) {
  const tx = await db.queryOne(`
    SELECT t.*, GROUP_CONCAT(
      '{"akun_id":' || j.akun_id || ',"akun_nama":"' || a.nama || '","debit":' || j.debit || ',"kredit":' || j.kredit || '}'
    ) as jurnal
    FROM transaksi t
    LEFT JOIN jurnal j ON j.transaksi_id = t.id
    LEFT JOIN akun a ON a.id = j.akun_id
    WHERE t.id = ?
    GROUP BY t.id
  `, [id]);
  if (!tx) return null;
  tx.jurnal = tx.jurnal ? JSON.parse(`[${tx.jurnal}]`) : [];
  return tx;
}

// Return { data } atau { error }. Tidak lempar exception untuk error bisnis.
async function createTransaksi(db, { tanggal, deskripsi, entries }) {
  if (!deskripsi || !entries || entries.length < 2) {
    return { error: 'Data tidak lengkap' };
  }
  const totalDebit = entries.reduce((s, e) => s + (parseFloat(e.debit) || 0), 0);
  const totalKredit = entries.reduce((s, e) => s + (parseFloat(e.kredit) || 0), 0);
  if (Math.abs(totalDebit - totalKredit) > 0.01) {
    return { error: 'Total debit dan kredit tidak sama' };
  }

  const tgl = tanggal || new Date().toISOString().slice(0, 10);
  await db.queryRun('INSERT INTO transaksi (tanggal, deskripsi) VALUES (?, ?)', [tgl, deskripsi]);
  const result = await db.queryOne('SELECT MAX(id) as id FROM transaksi');
  const tId = result.id;

  for (const e of entries) {
    await db.queryRun('INSERT INTO jurnal (transaksi_id, akun_id, debit, kredit) VALUES (?, ?, ?, ?)', [
      tId, e.akun_id, parseFloat(e.debit) || 0, parseFloat(e.kredit) || 0
    ]);
  }

  const data = await getTransaksi(db, tId);
  return { data };
}

async function deleteTransaksi(db, id) {
  await db.queryRun('DELETE FROM jurnal WHERE transaksi_id = ?', [id]);
  await db.queryRun('DELETE FROM transaksi WHERE id = ?', [id]);
  return { message: 'Transaksi dihapus' };
}

module.exports = { listTransaksi, getTransaksi, createTransaksi, deleteTransaksi };