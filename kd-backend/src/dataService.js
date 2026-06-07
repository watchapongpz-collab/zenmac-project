'use strict';

const DEFAULT_DEVICES = require('./defaultDevices');

// In-memory current state
const state = {
  kd:  {},  // zenzero/hmi/kd  — flow
  kd1: {},  // zenzero/hmi/kd1 — blower
  kd2: {},  // zenzero/hmi/kd2 — yesterday totals
  kd4: {},  // zenzero/hmi/kd4 — sensors
  kd5: {},  // zenzero/hmi/kd5 — status + day totals
};

// Ring-buffer history (last 288 points = 24 h at 5-min intervals)
const HISTORY_SIZE = 288;
const history = {};

function pushHistory(key, value, ts) {
  if (!history[key]) history[key] = [];
  history[key].push({ v: value, t: ts || Date.now() });
  if (history[key].length > HISTORY_SIZE) history[key].shift();
}

// Device registry (runtime copy, starts from DEFAULT_DEVICES)
let deviceRegistry = JSON.parse(JSON.stringify(DEFAULT_DEVICES));

module.exports = {
  // ── state accessors ──────────────────────────────────────────────
  getState() { return state; },

  updateTopic(topicKey, payload) {
    const ts = Date.now();
    state[topicKey] = { ...state[topicKey], ...payload, _ts: ts };

    // push numeric leaf values to history
    for (const [k, v] of Object.entries(payload)) {
      const num = parseFloat(v);
      if (!isNaN(num)) pushHistory(`${topicKey}.${k}`, num, ts);
    }
  },

  // ── history accessors ────────────────────────────────────────────
  getHistory(topicKey, field) {
    const key = `${topicKey}.${field}`;
    return history[key] || [];
  },

  getAllHistory() { return history; },

  // ── device registry ──────────────────────────────────────────────
  getDevices() { return deviceRegistry; },

  saveDevices(list) {
    deviceRegistry = list;
    return deviceRegistry;
  },

  upsertDevice(dev) {
    const idx = deviceRegistry.findIndex(d => d.id === dev.id);
    if (idx >= 0) {
      deviceRegistry[idx] = { ...deviceRegistry[idx], ...dev };
    } else {
      deviceRegistry.push(dev);
    }
    return deviceRegistry;
  },

  deleteDevice(id) {
    deviceRegistry = deviceRegistry.filter(d => d.id !== id);
    return deviceRegistry;
  },

  // live-update device lastVal / status from incoming data
  updateDeviceValues(topicKey, payload) {
    deviceRegistry.forEach(dev => {
      if (dev.topic_sub && dev.topic_sub.endsWith(topicKey) && dev.path) {
        const val = payload[dev.path];
        if (val !== undefined) {
          dev.lastVal = val;
          dev.status = 'online';
          dev._ts = Date.now();
        }
      }
    });
  },
};
