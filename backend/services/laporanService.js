// Services: laporan ringkas (neraca saldo, laba rugi, neraca). Dipakai routes + MCP.

async function getNeracaSaldo(db) {
  const saldo = await db.queryAll(`
    SELECT a.id, a.kode, a.nama, a.tipe, a.saldo_normal,
         COALESCE(SUM(j.debit), 0) as total_debit,
         COALESCE(SUM(j.kredit), 0) as total_kredit
    FROM akun a
    LEFT JOIN jurnal j ON j.akun_id = a.id
    LEFT JOIN transaksi t ON t.id = j.transaksi_id
    GROUP BY a.id
    ORDER BY a.kode
  `);
  return saldo.map(s => {
    let saldoVal = 0;
    if (s.saldo_normal === 'debit') {
      saldoVal = s.total_debit - s.total_kredit;
    } else {
      saldoVal = s.total_kredit - s.total_debit;
    }
    return { ...s, saldo: Math.round(saldoVal * 100) / 100 };
  });
}

async function getLabaRugi(db) {
  const data = await db.queryAll(`
    SELECT a.tipe, a.nama, a.kode,
           COALESCE(SUM(j.debit), 0) as total_debit,
           COALESCE(SUM(j.kredit), 0) as total_kredit
    FROM akun a
    LEFT JOIN jurnal j ON j.akun_id = a.id
    WHERE a.tipe IN ('pendapatan', 'beban')
    GROUP BY a.id
    ORDER BY a.kode
  `);
  const pendapatan = [];
  const beban = [];
  let totalPendapatan = 0;
  let totalBeban = 0;
  for (const d of data) {
    const saldo = d.tipe === 'pendapatan'
      ? d.total_kredit - d.total_debit
      : d.total_debit - d.total_kredit;
    const item = { ...d, saldo: Math.round(saldo * 100) / 100 };
    if (d.tipe === 'pendapatan') {
      pendapatan.push(item);
      totalPendapatan += item.saldo;
    } else {
      beban.push(item);
      totalBeban += item.saldo;
    }
  }
  const labaBersih = Math.round((totalPendapatan - totalBeban) * 100) / 100;
  return { pendapatan, beban, totalPendapatan, totalBeban, labaBersih };
}

async function getNeraca(db) {
  const data = await db.queryAll(`
    SELECT a.tipe, a.nama, a.kode, a.saldo_normal,
           COALESCE(SUM(j.debit), 0) as total_debit,
           COALESCE(SUM(j.kredit), 0) as total_kredit
    FROM akun a
    LEFT JOIN jurnal j ON j.akun_id = a.id
    WHERE a.tipe IN ('aset', 'kewajiban', 'ekuitas')
    GROUP BY a.id
    ORDER BY a.kode
  `);
  const aset = [];
  const kewajiban = [];
  const ekuitas = [];
  let totalAset = 0;
  let totalKewajiban = 0;
  let totalEkuitas = 0;

  const labaData = await db.queryAll(`
    SELECT a.tipe,
           COALESCE(SUM(j.debit), 0) as total_debit,
           COALESCE(SUM(j.kredit), 0) as total_kredit
    FROM akun a
    LEFT JOIN jurnal j ON j.akun_id = a.id
    WHERE a.tipe IN ('pendapatan', 'beban')
    GROUP BY a.tipe
  `);
  let totalPendapatan = 0;
  let totalBeban = 0;
  for (const d of labaData) {
    if (d.tipe === 'pendapatan') totalPendapatan = d.total_kredit - d.total_debit;
    if (d.tipe === 'beban') totalBeban = d.total_debit - d.total_kredit;
  }
  const labaBerjalan = Math.round((totalPendapatan - totalBeban) * 100) / 100;

  for (const d of data) {
    let saldo = d.saldo_normal === 'debit'
      ? d.total_debit - d.total_kredit
      : d.total_kredit - d.total_debit;
    saldo = Math.round(saldo * 100) / 100;
    const item = { ...d, saldo };
    if (d.tipe === 'aset') {
      aset.push(item);
      totalAset += saldo;
    } else if (d.tipe === 'kewajiban') {
      kewajiban.push(item);
      totalKewajiban += saldo;
    } else {
      ekuitas.push(item);
      totalEkuitas += saldo;
    }
  }

  if (labaBerjalan >= 0) {
    ekuitas.push({ nama: 'Laba Berjalan', saldo: labaBerjalan, is_laba: true });
  } else {
    ekuitas.push({ nama: 'Rugi Berjalan', saldo: Math.abs(labaBerjalan), is_laba: false, is_rugi: true });
  }
  totalEkuitas += labaBerjalan;
  totalEkuitas = Math.round(totalEkuitas * 100) / 100;

  return {
    aset, kewajiban, ekuitas,
    totalAset: Math.round(totalAset * 100) / 100,
    totalKewajiban: Math.round(totalKewajiban * 100) / 100,
    totalEkuitas: Math.round(totalEkuitas * 100) / 100
  };
}

module.exports = { getNeracaSaldo, getLabaRugi, getNeraca };