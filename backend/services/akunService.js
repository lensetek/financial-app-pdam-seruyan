// Services: akun (COA). Dipakai bersama oleh routes dan MCP tools.

async function listAkun(db) {
  return db.queryAll('SELECT * FROM akun ORDER BY kode');
}

async function getAkun(db, { id, kode } = {}) {
  if (kode !== undefined) {
    return db.queryOne('SELECT * FROM akun WHERE kode = ?', [kode]);
  }
  return db.queryOne('SELECT * FROM akun WHERE id = ?', [id]);
}

module.exports = { listAkun, getAkun };