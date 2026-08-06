const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const tokenService = require('../services/tokenService');

module.exports = function (db) {
  router.use(adminAuth);

  router.get('/', async (req, res) => {
    const tokens = await tokenService.listTokens(db);
    res.json(tokens);
  });

  router.post('/', async (req, res) => {
    const { name, roles, expires_in_days, notes } = req.body || {};
    const actor = req.admin.email || req.admin.id;
    const result = await tokenService.createToken(db, { name, roles, expires_in_days, notes, actor });
    res.status(201).json(result);
  });

  router.post('/:id/revoke', async (req, res) => {
    const actor = req.admin.email || req.admin.id;
    const result = await tokenService.revokeToken(db, req.params.id, actor);
    res.json(result);
  });

  router.post('/:id/extend', async (req, res) => {
    const { days } = req.body || {};
    const result = await tokenService.extendToken(db, req.params.id, days);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  router.delete('/:id', async (req, res) => {
    const result = await tokenService.deleteToken(db, req.params.id);
    res.json(result);
  });

  return router;
};