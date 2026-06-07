'use strict';

require('dotenv').config();

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const morgan   = require('morgan');

const mqttService = require('./src/mqttService');
const dataService = require('./src/dataService');
const buildRoutes = require('./src/routes');
const { mapMqttToLive, zeroLive, buildHistory } = require('./src/liveService');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST'] },
});

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(morgan('dev'));

// REST API
app.use('/api', buildRoutes(dataService, mqttService));

// WebSocket
io.on('connection', (socket) => {
  console.log('[WS] Client connected:', socket.id);

  // ── ส่งข้อมูลทันทีเมื่อ connect (ตาม template pattern) ──────────
  socket.emit('kd:status',  mqttService.getStatus());          // legacy
  socket.emit('kd:snapshot', dataService.getState());          // legacy
  socket.emit('live',    mapMqttToLive(dataService.getState())); // clean shape
  socket.emit('history', buildHistory(dataService));            // 24-hr history
  socket.emit('rawmqtt', dataService.getState());               // raw topics

  // ── รับคำสั่ง publish จาก frontend ──────────────────────────────
  socket.on('param:publish', (payload) => {
    if (!payload || typeof payload !== 'object') return;
    const topic = payload.topic || 'zenzero/cmd/kd/param';
    const data  = payload.data  || payload;
    console.log('[WS] param:publish →', topic, data);
    mqttService.publish(topic, data);
  });

  socket.on('disconnect', () => {
    console.log('[WS] Client disconnected:', socket.id);
  });
});

// Start MQTT bridge
mqttService.init(io, dataService);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🚀 KD-Backend listening on http://localhost:${PORT}`);
  console.log(`   REST  → http://localhost:${PORT}/api`);
  console.log(`   WS    → ws://localhost:${PORT}`);
});
