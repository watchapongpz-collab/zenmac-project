'use strict';

const express = require('express');

module.exports = function buildRoutes(dataService, mqttService) {
  const router = express.Router();

  // GET /api/status — MQTT + server health
  router.get('/status', (_req, res) => {
    res.json({ ok: true, mqtt: mqttService.getStatus(), ts: Date.now() });
  });

  // GET /api/state — current values of all 5 topics
  router.get('/state', (_req, res) => {
    res.json(dataService.getState());
  });

  // GET /api/history/:topicKey/:field — ring-buffer history
  // e.g. /api/history/kd4/Process_ORP_Lock_hr
  router.get('/history/:topicKey/:field', (req, res) => {
    const { topicKey, field } = req.params;
    const hist = dataService.getHistory(topicKey, decodeURIComponent(field));
    res.json(hist);
  });

  // GET /api/devices — full device registry
  router.get('/devices', (_req, res) => {
    res.json(dataService.getDevices());
  });

  // POST /api/devices — replace full device registry
  router.post('/devices', (req, res) => {
    const list = req.body;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'Expected array' });
    res.json(dataService.saveDevices(list));
  });

  // PUT /api/devices/:id — upsert single device
  router.put('/devices/:id', (req, res) => {
    const dev = { ...req.body, id: req.params.id };
    res.json(dataService.upsertDevice(dev));
  });

  // DELETE /api/devices/:id
  router.delete('/devices/:id', (req, res) => {
    res.json(dataService.deleteDevice(req.params.id));
  });

  // POST /api/cmd/blower/:n — blower control
  // body: { cmd: 'start'|'stop'|'standby', speed_pct: 0-100 }
  router.post('/cmd/blower/:n', (req, res) => {
    const n = req.params.n;
    const topic = `zenzero/cmd/kd/blower/${n}/setpoint`;
    const result = mqttService.publish(topic, { ...req.body, source: 'dashboard', ts: Date.now() });
    res.json(result);
  });

  // POST /api/cmd/pump/:side — pump control (process|serum)
  // body: { cmd: 'start'|'stop' }
  router.post('/cmd/pump/:side', (req, res) => {
    const side = req.params.side;
    const topic = `zenzero/cmd/kd/${side}/pump/cmd`;
    const result = mqttService.publish(topic, { ...req.body, source: 'dashboard', ts: Date.now() });
    res.json(result);
  });

  // POST /api/cmd/publish — generic publish
  // body: { topic, payload }
  router.post('/cmd/publish', (req, res) => {
    const { topic, payload } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic required' });
    res.json(mqttService.publish(topic, payload || {}));
  });

  return router;
};
