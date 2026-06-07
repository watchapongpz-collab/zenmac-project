'use strict';

const mqtt = require('mqtt');
const { mapMqttToLive } = require('./liveService');

const SUBSCRIBE_TOPICS = [
  'zenzero/hmi/kd',
  'zenzero/hmi/kd1',
  'zenzero/hmi/kd2',
  'zenzero/hmi/kd4',
  'zenzero/hmi/kd5',
];

// Map full topic → state key
const TOPIC_KEY_MAP = {
  'zenzero/hmi/kd':  'kd',
  'zenzero/hmi/kd1': 'kd1',
  'zenzero/hmi/kd2': 'kd2',
  'zenzero/hmi/kd4': 'kd4',
  'zenzero/hmi/kd5': 'kd5',
};

let client = null;
let _io = null;
let _data = null;
let connected = false;

function init(io, dataService) {
  _io = io;
  _data = dataService;

  const brokerUrl = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
  const opts = {
    clientId: process.env.MQTT_CLIENT_ID || 'kd-backend-01',
    clean: true,
    reconnectPeriod: 5000,
  };
  if (process.env.MQTT_USERNAME) opts.username = process.env.MQTT_USERNAME;
  if (process.env.MQTT_PASSWORD) opts.password = process.env.MQTT_PASSWORD;

  console.log(`[MQTT] Connecting to ${brokerUrl}…`);
  client = mqtt.connect(brokerUrl, opts);

  client.on('connect', () => {
    connected = true;
    console.log('[MQTT] Connected');
    client.subscribe(SUBSCRIBE_TOPICS, { qos: 1 }, (err) => {
      if (err) console.error('[MQTT] Subscribe error:', err.message);
      else console.log('[MQTT] Subscribed:', SUBSCRIBE_TOPICS.join(', '));
    });
    _io.emit('kd:status', { connected: true, broker: brokerUrl });
  });

  client.on('message', (topic, buf) => {
    let data;
    try { data = JSON.parse(buf.toString()); } catch { return; }

    const key = TOPIC_KEY_MAP[topic];
    if (!key) return;

    _data.updateTopic(key, data);
    _data.updateDeviceValues(key, data);

    const live = mapMqttToLive(_data.getState());
    _io.emit('kd:update', { key, data, ts: Date.now() });  // raw (backward compat)
    _io.emit('live', live);                                 // clean mapped shape
  });

  client.on('error', (err) => {
    console.error('[MQTT] Error:', err.message);
    _io.emit('kd:status', { connected: false, error: err.message });
  });

  client.on('close', () => {
    connected = false;
    console.log('[MQTT] Disconnected');
    _io.emit('kd:status', { connected: false });
  });

  client.on('reconnect', () => {
    console.log('[MQTT] Reconnecting…');
    _io.emit('kd:status', { connected: false, reconnecting: true });
  });
}

function publish(topic, payload, qos = 1) {
  if (!client || !connected) {
    return { ok: false, error: 'MQTT not connected' };
  }
  const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
  client.publish(topic, msg, { qos }, (err) => {
    if (err) console.error('[MQTT] Publish error:', err.message);
    else _io.emit('kd:published', { topic, payload, ts: Date.now() });
  });
  return { ok: true };
}

function getStatus() {
  return {
    connected,
    broker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
    topics: SUBSCRIBE_TOPICS,
  };
}

module.exports = { init, publish, getStatus };
