const express = require('express');
const router = express.Router();
const { listTransaksi, getTransaksi, createTransaksi, deleteTransaksi } = require('../services/transaksiService');

module.exports = function(db) {
  router.get('/', async (req, res) => {
    const transaksi = await listTransaksi(db);
    res.json(transaksi);
  });

  router.get('/:id', async (req, res) => {
    const tx = await getTransaksi(db, req.params.id);
    if (!tx) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    res.json(tx);
  });

  router.post('/', async (req, res) => {
    const { tanggal, deskripsi, entries } = req.body;
    const result = await createTransaksi(db, { tanggal, deskripsi, entries });
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result.data);
  });

  router.delete('/:id', async (req, res) => {
    await deleteTransaksi(db, req.params.id);
    res.json({ message: 'Transaksi dihapus' });
  });

  return router;
};