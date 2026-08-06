const express = require('express');
const router = express.Router();
const { getNeracaSaldo, getLabaRugi, getNeraca } = require('../services/laporanService');

module.exports = function(db) {
  router.get('/neraca-saldo', async (req, res) => {
    res.json(await getNeracaSaldo(db));
  });

  router.get('/laba-rugi', async (req, res) => {
    res.json(await getLabaRugi(db));
  });

  router.get('/neraca', async (req, res) => {
    res.json(await getNeraca(db));
  });

  return router;
};