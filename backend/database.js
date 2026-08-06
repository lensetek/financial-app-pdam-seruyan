const { Pool } = require('pg');
const crypto = require('crypto');
const COA = require('./coa-master');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function transpileSql(sql) {
  let i = 1;
  // Replace ? with $1, $2...
  let pgSql = sql.replace(/\?/g, () => `$${i++}`);
  // Replace GROUP_CONCAT(...) with STRING_AGG(..., ',')
  // This is a naive replace, might need manual fixing if complex
  pgSql = pgSql.replace(/GROUP_CONCAT\((.*?)\)/gs, "STRING_AGG($1, ',')");
  // Replace date('now') or datetime('now')
  pgSql = pgSql.replace(/datetime\('now'\)/g, 'NOW()');
  pgSql = pgSql.replace(/date\('now'\)/g, 'CURRENT_DATE');
  return pgSql;
}

async function queryAll(sql, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(transpileSql(sql), params);
    return res.rows;
  } finally {
    client.release();
  }
}

async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function run(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(transpileSql(sql), params);
    return result; // return full result including rowCount
  } finally {
    client.release();
  }
}

async function initDatabase() {
  console.log('Connecting to Supabase Postgres...');
  
  // Create tables if they don't exist
  await run(`
    CREATE TABLE IF NOT EXISTS akun (
      id SERIAL PRIMARY KEY,
      kode TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL,
      tipe TEXT NOT NULL CHECK(tipe IN ('aset','kewajiban','ekuitas','pendapatan','beban')),
      saldo_normal TEXT NOT NULL CHECK(saldo_normal IN ('debit','kredit')),
      kategori TEXT DEFAULT ''
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS transaksi (
      id SERIAL PRIMARY KEY,
      tanggal TEXT NOT NULL DEFAULT (CURRENT_DATE::text),
      deskripsi TEXT NOT NULL,
      sumber TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS jurnal (
      id SERIAL PRIMARY KEY,
      transaksi_id INTEGER NOT NULL,
      akun_id INTEGER NOT NULL,
      debit NUMERIC DEFAULT 0,
      kredit NUMERIC DEFAULT 0,
      FOREIGN KEY (transaksi_id) REFERENCES transaksi(id) ON DELETE CASCADE,
      FOREIGN KEY (akun_id) REFERENCES akun(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      kategori TEXT NOT NULL,
      sumber_file TEXT DEFAULT '',
      deskripsi TEXT NOT NULL,
      status TEXT DEFAULT 'SUCCESS',
      detail TEXT DEFAULT '',
      hash TEXT DEFAULT '',
      prev_hash TEXT DEFAULT '',
      before_state TEXT DEFAULT '',
      after_state TEXT DEFAULT ''
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS login_sessions (
      id SERIAL PRIMARY KEY,
      user_email TEXT NOT NULL,
      login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      status TEXT DEFAULT 'SUCCESS'
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS mcp_tokens (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      token_prefix TEXT NOT NULL,
      roles TEXT[] NOT NULL DEFAULT ARRAY['viewer']::TEXT[],
      created_by TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used_at TIMESTAMP,
      expires_at TIMESTAMP,
      revoked_at TIMESTAMP,
      revoked_by TEXT,
      notes TEXT DEFAULT ''
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_mcp_tokens_hash ON mcp_tokens(token_hash)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_mcp_tokens_active ON mcp_tokens(revoked_at) WHERE revoked_at IS NULL`);
  await run(`CREATE INDEX IF NOT EXISTS idx_mcp_tokens_roles ON mcp_tokens USING GIN(roles)`);

  await run(`
    CREATE TABLE IF NOT EXISTS mcp_token_audit (
      id SERIAL PRIMARY KEY,
      token_id INTEGER REFERENCES mcp_tokens(id) ON DELETE SET NULL,
      event TEXT NOT NULL,
      tool_name TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      detail TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_mcp_audit_token ON mcp_token_audit(token_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_mcp_audit_time ON mcp_token_audit(created_at)`);

  // Insert Default COA if empty
  const countRes = await queryOne('SELECT COUNT(*) as cnt FROM akun');
  if (parseInt(countRes.cnt) === 0) {
    for (const a of COA) {
      await run(
        'INSERT INTO akun (kode, nama, tipe, saldo_normal, kategori) VALUES ($1, $2, $3, $4, $5)',
        [a.kode, a.nama, a.tipe, a.saldo_normal, a.kategori]
      );
    }
    console.log('Inserted default COA.');
  } else {
    console.log('Database connected and initialized.');
  }

  // Create a database object with async functions to maintain some compatibility
  const db = {
    queryAll,
    queryOne,
    queryRun: run,
    
    insertAuditLog: async function(kategori, sumber_file, deskripsi, status, detail, beforeState = null, afterState = null) {
      const timestamp = new Date().toISOString();
      
      const prevLog = await queryOne('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1');
      const prev_hash = prevLog && prevLog.hash ? prevLog.hash : 'GENESIS';

      const bsStr = beforeState ? JSON.stringify(beforeState) : '';
      const asStr = afterState ? JSON.stringify(afterState) : '';

      const rawString = `${prev_hash}${timestamp}${kategori}${sumber_file}${deskripsi}${status}${bsStr}${asStr}`;
      const hash = crypto.createHash('sha256').update(rawString).digest('hex');

      await run(`
        INSERT INTO audit_log 
        (timestamp, kategori, sumber_file, deskripsi, status, detail, hash, prev_hash, before_state, after_state)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [timestamp, kategori, sumber_file, deskripsi, status, detail, hash, prev_hash, bsStr, asStr]);

      return hash;
    }
  };

  return db;
}

module.exports = { initDatabase, queryAll, queryOne, run };
