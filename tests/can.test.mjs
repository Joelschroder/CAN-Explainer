import test from 'node:test';
import assert from 'node:assert/strict';
import { arbitrate, classifyRaw, decodeJ1939Id, decodeSignal, diagnoseBench, encodeJ1939Id, encodePhysical, extractRaw, insertRaw, measuredResistance } from '../js/can.js';
import { MESSAGES, SIGNALS, reach } from '../js/data.js';

test('J1939-ID: EEC1 från motorn', () => {
  const d = decodeJ1939Id(0x0cf00400);
  assert.deepEqual([d.priority, d.pgn, d.sa, d.pdu1], [3, 61444, 0x00, false]);
});

test('J1939-ID: ERC1 från retardern', () => {
  const d = decodeJ1939Id(0x18f00010);
  assert.deepEqual([d.priority, d.pgn, d.sa], [6, 61440, 0x10]);
});

test('J1939-ID: PDU1 har destinationsadress utanför PGN', () => {
  const d = decodeJ1939Id(0x0c00100b);
  assert.deepEqual([d.pgn, d.pdu1, d.da, d.sa], [0, true, 0x10, 0x0b]);
});

test('J1939-ID: koda och avkoda går runt', () => {
  for (const id of [0x0cf00400, 0x18f00010, 0x18fef100, 0x0cfe6cee, 0x0c00100b, 0x18ff0080]) {
    const d = decodeJ1939Id(id);
    assert.equal(encodeJ1939Id(d), id);
  }
});

test('arbitrering: lägst ID vinner', () => {
  const r = arbitrate([0x0cfe6cee, 0x18f00010, 0x0cf00400]);
  assert.deepEqual(r.winners, [2]);
  assert.deepEqual(r.steps[0].lost, [1]); // 0x18... förlorar på första biten
});

test('arbitrering: samma ID ger två vinnare', () => {
  assert.deepEqual(arbitrate([0x100, 0x100, 0x200]).winners, [0, 1]);
});

test('råvärden: Intel-ordning över bytegräns', () => {
  const bytes = [0xf0, 0x7d, 0x7d, 0x60, 0x22, 0x00, 0xf0, 0x7d];
  assert.equal(extractRaw(bytes, 24, 16), 0x2260);
  assert.equal(decodeSignal(bytes, SIGNALS.engSpeed).value, 1100);
  assert.deepEqual(insertRaw(bytes, 24, 16, 8000).slice(3, 5), [0x40, 0x1f]);
});

test('signaler: retardermoment med offset', () => {
  const bytes = [0xd1, 0x4b, 0x7d, 0xff, 0xff, 0xff, 0xff, 0xff];
  assert.equal(decodeSignal(bytes, SIGNALS.retTorque).value, -50);
  assert.equal(decodeSignal(bytes, SIGNALS.retBrakeAssist).raw, 1);
  assert.equal(decodeSignal(bytes, SIGNALS.retShiftAssist).state, 'na');
  assert.equal(decodeSignal(bytes, SIGNALS.retTorqueMode).raw, 1);
  assert.equal(encodePhysical(-40, SIGNALS.retTorque), 0x55);
});

test('specialvärden', () => {
  assert.equal(classifyRaw(0xff, 8), 'na');
  assert.equal(classifyRaw(0xfe, 8), 'error');
  assert.equal(classifyRaw(0xfa, 8), 'ok');
  assert.equal(classifyRaw(0xff00, 16), 'na');
  assert.equal(classifyRaw(0xfaff, 16), 'ok');
  assert.equal(classifyRaw(2, 2), 'error');
  assert.equal(decodeSignal([0xff, 0xff], SIGNALS.retTorque).value, null);
});

test('terminering', () => {
  assert.equal(measuredResistance(true, true), 60);
  assert.equal(measuredResistance(true, false), 120);
  assert.equal(measuredResistance(false, false), Infinity);
});

test('bänkdiagnos', () => {
  const base = { instruments: 3, termA: true, termB: true, silent: false, bitrateMismatch: false, duplicateId: false };
  assert.ok(diagnoseBench(base).every((r) => r.level === 'ok'));
  assert.equal(diagnoseBench({ ...base, instruments: 1, silent: true }).find((r) => r.key === 'ack').level, 'bad');
  assert.equal(diagnoseBench({ ...base, silent: true }).find((r) => r.key === 'ack').level, 'ok');
  assert.equal(diagnoseBench({ ...base, termB: false }).find((r) => r.key === 'term').level, 'warn');
  assert.equal(diagnoseBench({ ...base, duplicateId: true }).find((r) => r.key === 'id').level, 'bad');
});

test('gateways: vilka bussar ett meddelande når', () => {
  assert.deepEqual(reach('eec1').buses.sort(), ['bb', 'cab', 'fms', 'pt']);
  assert.deepEqual(reach('erc1').buses.sort(), ['cab', 'fms', 'pt']);
  assert.deepEqual(reach('pto').buses.sort(), ['bb', 'cab', 'pt']);
  assert.deepEqual(reach('junk'), { buses: ['bb'], blockedAt: ['bbm'] });
  assert.equal(decodeJ1939Id(MESSAGES.tco1.id).sa, 0xee);
});
