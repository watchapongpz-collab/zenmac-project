'use strict';

// Helper: ดึงค่า number จาก array หรือ scalar (ตาม pattern ใน SETUP_NEW_PROJECT.md)
function val(v, fallback = 0) {
  if (Array.isArray(v)) return v[0] != null ? +v[0] : fallback;
  return v != null ? +v : fallback;
}

function str(v, fallback = '—') {
  return v != null ? String(v) : fallback;
}

// Map raw MQTT state → clean LiveData shape สำหรับ frontend
function mapMqttToLive(state) {
  const d  = state.kd  || {};
  const d1 = state.kd1 || {};
  const d2 = state.kd2 || {};
  const d4 = state.kd4 || {};
  const d5 = state.kd5 || {};

  return {
    ts: new Date().toISOString(),

    // ── Flow ──────────────────────────────────────────────────────
    serumFlow:     +val(d['Serum Flow m3_hr (real)']).toFixed(2),
    processFlow:   +val(d['Process Flow m3_hr (Real)']).toFixed(2),

    // ── ORP / pH / Temp ───────────────────────────────────────────
    serumORP:      +val(d4['Serum_ORP_Lock_hr']).toFixed(1),
    processORP:    +val(d4['Process_ORP_Lock_hr']).toFixed(1),
    serumPH:       +val(d4['Serum_PH_Lock_hr']).toFixed(2),
    processPH:     +val(d4['Process_pH_Lock_hr']).toFixed(2),
    serumTemp:     +val(d4['Serum_Temp_Lock_hr']).toFixed(1),
    processTemp:   +val(d4['Process_Temp_Lock_hr']).toFixed(1),

    // ── Blower ────────────────────────────────────────────────────
    tb1Power:      +val(d1['TB_1_BLOWER POWER_kW']).toFixed(1),
    tb2Power:      +val(d1['TB_2_BLOWER POWER_kW']).toFixed(1),
    tb1Current:    +val(d1['TB_1_MOTOR CURRENT_A']).toFixed(1),
    tb2Current:    +val(d1['TB_2_MOTOR CURRENT_A']).toFixed(1),
    blowerTotalPower: +(val(d1['TB_1_BLOWER POWER_kW']) + val(d1['TB_2_BLOWER POWER_kW'])).toFixed(1),

    // ── Status ────────────────────────────────────────────────────
    tb1Status:         str(d5['TB-01_Status'],          'STOP'),
    tb2Status:         str(d5['TB-02_Status'],          'STOP'),
    serumPumpStatus:   str(d5['Serum pump_Status'],     'STOP'),
    processPumpStatus: str(d5['Process pump_Status'],   'STOP'),

    // ── Daily Totals ──────────────────────────────────────────────
    serumFlowDay:   +val(d5['Serum Flow M3_Day_real']).toFixed(1),
    processFlowDay: +val(d5['Process Flow M3_Day_real']).toFixed(1),
    totalFlowDay:   +val(d5['Process+Serum Flow M3_Day_real']).toFixed(1),

    // ── Yesterday ────────────────────────────────────────────────
    serumFlowYest:   +val(d2['Serum Flow M3_Day_Lock_yesterday']).toFixed(1),
    processFlowYest: +val(d2['Process Flow M3_Day_Lock_yesterday']).toFixed(1),
  };
}

// Default zero values เมื่อยังไม่มี MQTT data
function zeroLive() {
  return mapMqttToLive({});
}

// Build 24-hr history array shape จาก ring buffer ของ dataService
function buildHistory(dataService) {
  const fields = ['serumFlow', 'processFlow', 'serumORP', 'processORP'];
  const keyMap = {
    serumFlow:   'kd.Serum Flow m3_hr (real)',
    processFlow: 'kd.Process Flow m3_hr (Real)',
    serumORP:    'kd4.Serum_ORP_Lock_hr',
    processORP:  'kd4.Process_ORP_Lock_hr',
  };

  const result = { labels: [], serumFlow: [], processFlow: [], serumORP: [], processORP: [] };

  // ใช้ timestamps จาก serumFlow เป็น base
  const base = dataService.getHistory('kd', 'Serum Flow m3_hr (real)');
  result.labels = base.map(p => {
    const d = new Date(p.t);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  });

  for (const field of fields) {
    const [topicKey, ...rest] = keyMap[field].split('.');
    const fieldName = rest.join('.');
    result[field] = dataService.getHistory(topicKey, fieldName).map(p => p.v);
  }

  return result;
}

module.exports = { mapMqttToLive, zeroLive, buildHistory, val, str };
