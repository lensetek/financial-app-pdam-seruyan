const express = require('express');
const router = express.Router();
const { listAkun } = require('../services/akunService');

module.exports = function(db) {
  router.get('/', async (req, res) => {
    const akun = await listAkun(db);
    res.json(akun);
  });

  return router;
};