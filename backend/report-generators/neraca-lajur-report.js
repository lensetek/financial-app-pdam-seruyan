const XLSX = require('xlsx-js-style');

const MONTHS = [
  { name: 'JANUARI', days: 31, endStr: '31 JANUARI 2026', nextMonth: null },
  { name: 'FEBRUARI', days: 28, endStr: '28 FEBRUARI 2026', nextMonth: 'MARET' },
  { name: 'MARET', days: 31, endStr: '31 MARET 2026', nextMonth: 'APRIL' },
  { name: 'APRIL', days: 30, endStr: '30 APRIL 2026', nextMonth: 'MEI' },
  { name: 'MEI', days: 31, endStr: '31 MEI 2026', nextMonth: null },
];

const LAST_DAY = { JANUARI: '31', FEBRUARI: '28', MARET: '31', APRIL: '30', MEI: '31' };

async function generateNeracaLajur(db, outputPath, exportDate = null) {
  const wb = XLSX.utils.book_new();
  const tahunCetak = exportDate ? new Date(exportDate).getFullYear() : new Date().getFullYear();

  const akunList = await db.queryAll('SELECT * FROM akun ORDER BY kode');

  async function getMonthlyData(monthIndex) {
    const endDate = '2026-' + String(monthIndex + 1).padStart(2, '0') + '-' + LAST_DAY[MONTHS[monthIndex].name];
    
    const data = [];
    data.push(['NERACA LAJUR', '', '', '', '', '', '', '', '', '', '', '']);
    data.push(['PERUSAHAAN UMUM DAERAH AIR MINUM TIRTA SERUYAN', '', '', '', '', '', '', '', '', '', '', '']);
    data.push(['UNTUK TAHUN YANG BERAKHIR ' + LAST_DAY[MONTHS[monthIndex].name] + ' ' + MONTHS[monthIndex].name + ' ' + tahunCetak, '', '', '', '', '', '', '', '', '', '', '']);
    data.push(['', '', '', '', '', '', '', '', '', '', '', '']);
    data.push(['URAIAN', '', 'NERACA SALDO AWAL', '', 'MUTASI', '', 'NERACA SALDO', '', 'RUGI/ LABA', '', 'NERACA AKHIR', '']);
    data.push(['', '', 'D', 'K', 'D', 'K', 'D', 'K', 'D', 'K', 'D', 'K']);
    data.push(['', '', 'PER 01 JANUARI 2025', '', '', '', 'PER ' + LAST_DAY[MONTHS[monthIndex].name] + ' ' + MONTHS[monthIndex].name + ' ' + tahunCetak, '', 'PER ' + LAST_DAY[MONTHS[monthIndex].name] + ' ' + MONTHS[monthIndex].name + ' ' + tahunCetak, '', 'PER ' + LAST_DAY[MONTHS[monthIndex].name] + ' ' + MONTHS[monthIndex].name + ' ' + tahunCetak, '']);

    // Optimisasi: 1 query aggregate semua akun per bulan (bukan 1 query per akun).
    const aggRows = await db.queryAll(`
      SELECT j.akun_id,
             COALESCE(SUM(j.debit), 0) as total_debit,
             COALESCE(SUM(j.kredit), 0) as total_kredit
      FROM jurnal j
      JOIN transaksi t ON t.id = j.transaksi_id
      WHERE t.tanggal <= ?
      GROUP BY j.akun_id
    `, [endDate]);
    const aggMap = new Map(aggRows.map(r => [r.akun_id, r]));

    for (const a of akunList) {
      const agg = aggMap.get(a.id) || { total_debit: 0, total_kredit: 0 };
      const totalD = parseFloat(agg.total_debit) || 0;
      const totalK = parseFloat(agg.total_kredit) || 0;
      const neracaSaldo = a.saldo_normal === 'debit' ? totalD - totalK : totalK - totalD;
      const neracaAkhir = a.saldo_normal === 'debit' ? totalD - totalK : totalK - totalD;

      const isRL = a.tipe === 'pendapatan' || a.tipe === 'beban';
      let rugiLabD = '', rugiLabK = '';
      if (isRL) {
        if (a.saldo_normal === 'kredit') {
          rugiLabD = neracaAkhir < 0 ? Math.abs(neracaAkhir) : '';
          rugiLabK = neracaAkhir > 0 ? neracaAkhir : '';
        } else {
          rugiLabD = neracaAkhir > 0 ? neracaAkhir : '';
          rugiLabK = neracaAkhir < 0 ? Math.abs(neracaAkhir) : '';
        }
      }

      const row = [a.nama, '', '', '', '', '', '', '', '', '', '', ''];
      if (a.saldo_normal === 'debit') {
        row[6] = neracaSaldo > 0 ? neracaSaldo : '';
        row[7] = neracaSaldo < 0 ? Math.abs(neracaSaldo) : '';
        row[10] = neracaAkhir > 0 ? neracaAkhir : '';
        row[11] = neracaAkhir < 0 ? Math.abs(neracaAkhir) : '';
      } else {
        row[6] = neracaSaldo < 0 ? Math.abs(neracaSaldo) : '';
        row[7] = neracaSaldo > 0 ? neracaSaldo : '';
        row[10] = neracaAkhir < 0 ? Math.abs(neracaAkhir) : '';
        row[11] = neracaAkhir > 0 ? neracaAkhir : '';
      }
      row[8] = rugiLabD;
      row[9] = rugiLabK;

      data.push(row);
    }

    return data;
  }

  for (let i = 0; i < MONTHS.length; i++) {
    const monthData = await getMonthlyData(i);
    const sheet = XLSX.utils.aoa_to_sheet(monthData);
    sheet['!cols'] = [{ wch: 35 }, { wch: 5 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, sheet, 'NERCA LAJUR ' + MONTHS[i].name);
  }

  const { addTableStyles } = require('./index');
  if (typeof addTableStyles === 'function') addTableStyles(wb);
  XLSX.writeFile(wb, outputPath, { compression: true, bookType: 'xlsx' });
  return outputPath;
}

module.exports = { generateNeracaLajur };
