// Nätverksmodell och J1939-uppslag. Scenen (scene.js) ritar det här, stegen (steps.js) pratar om det.
// Layouten är pedagogisk, inte en ritning av en viss lastbil.

export const NODES = {
  // --- Lastbilen ---
  ems: { group: 'truck', label: 'EMS', sub: 'Motor', sa: 0x00, pos: [-2.6, 1.82, 0.45] },
  tcm: { group: 'truck', label: 'TCM', sub: 'Växellåda', sa: 0x03, pos: [-1.5, 1.56, 0.45] },
  ret: { group: 'truck', label: 'RET', sub: 'Retarder', sa: 0x10, pos: [-0.6, 1.46, 0.45] },
  ebs: { group: 'truck', label: 'EBS', sub: 'Bromsar', sa: 0x0b, pos: [1.1, 1.36, 0.45] },
  gw: { group: 'truck', label: 'GW', sub: 'Central gateway', pos: [-3.15, 2.15, 0] },
  icl: { group: 'truck', label: 'ICL', sub: 'Instrument', sa: 0x17, pos: [-3.75, 2.9, 0.75] },
  tco: { group: 'truck', label: 'TCO', sub: 'Färdskrivare', sa: 0xee, pos: [-3.3, 3.0, -0.65] },
  spak: { group: 'truck', label: 'Spak', sub: 'Hjälpbroms', pos: [-3.8, 2.15, -0.45], shape: 'lever' },
  bbm: { group: 'truck', label: 'BBM', sub: 'Påbyggnadsgateway', sa: 0x21, pos: [0.75, 1.36, -0.6] },
  body: { group: 'truck', label: 'PBG', sub: 'Påbyggnad', pos: [2.6, 1.86, -0.2] },
  tel: { group: 'truck', label: 'TEL', sub: 'Telematik', pos: [-2.3, 3.05, 0.6] },

  // --- Närbild på kabeln ---
  wa: { group: 'wire', label: 'Nod A', pos: [-1.7, 1.55, 0] },
  wb: { group: 'wire', label: 'Nod B', pos: [0, 1.55, 0] },
  wc: { group: 'wire', label: 'Nod C', pos: [1.7, 1.55, 0] },

  // --- Arbetsbänken med dosan ---
  i1: { group: 'bench', label: 'Instrument 1', pos: [-1.4, 0.32, -1.5], shape: 'sensor' },
  i2: { group: 'bench', label: 'Instrument 2', pos: [-0.4, 0.32, -1.5], shape: 'sensor' },
  i3: { group: 'bench', label: 'Instrument 3', pos: [0.6, 0.32, -1.5], shape: 'sensor' },
  io: { group: 'bench', label: 'I/O-modul', sub: 'trådar in, CAN ut', pos: [1.5, 0.32, -1.5], shape: 'io' },
  lever: { group: 'bench', label: 'Spak', sub: 'inte CAN', pos: [2.3, 0.4, -2.4], shape: 'lever' },
  vn: { group: 'bench', label: 'Vector-interface', pos: [2.95, 0.3, 0], shape: 'vn' },
  pc: { group: 'bench', label: 'Applikation', pos: [4.6, 0.35, 0], shape: 'laptop' },
};

export const BUSES = {
  pt: {
    group: 'truck', name: 'Drivlina', token: '--bus-pt', speed: 3.4,
    pts: [[-3.15, 1.9, 0.2], [-3.15, 1.05, 0.2], [1.4, 1.05, 0.2]],
    nodes: ['gw', 'ems', 'tcm', 'ret', 'ebs'],
  },
  cab: {
    group: 'truck', name: 'Hytt och instrument', token: '--bus-cab', speed: 3.4,
    pts: [[-3.5, 2.45, 0.85], [-3.5, 2.45, -0.85], [-3.5, 1.2, -0.85], [0.75, 1.2, -0.85]],
    nodes: ['icl', 'gw', 'tco', 'bbm'],
  },
  bb: {
    group: 'truck', name: 'Påbyggnad', token: '--bus-bb', speed: 3.4,
    pts: [[1.0, 1.6, -0.35], [3.7, 1.6, -0.35]],
    nodes: ['bbm', 'body'],
  },
  fms: {
    group: 'truck', name: 'FMS / telematik', token: '--bus-fms', speed: 3.4,
    pts: [[-2.95, 2.3, 0.3], [-2.3, 2.3, 0.3], [-2.3, 2.85, 0.3]],
    nodes: ['gw', 'tel'],
  },
  wire: {
    group: 'wire', name: 'Bussen', render: 'twisted', speed: 3.2,
    pts: [[-3, 0.6, 0], [3, 0.6, 0]],
    nodes: ['wa', 'wb', 'wc'],
  },
  bench: {
    group: 'bench', name: 'CAN i dosan', render: 'pair', speed: 2.6,
    pts: [[-1.6, 0.3, 0], [2.6, 0.3, 0]],
    nodes: ['i1', 'i2', 'i3', 'io', 'vn'],
  },
  usb: {
    group: 'bench', name: 'USB', token: '--muted', speed: 2.6,
    pts: [[3.3, 0.3, 0], [4.2, 0.3, 0]],
    nodes: ['vn', 'pc'],
  },
};

// Vanliga ledningar som inte är CAN.
export const WIRES = [
  { group: 'truck', from: 'spak', to: 'gw' },
  { group: 'bench', from: 'lever', to: 'io' },
];

/**
 * accept: noder som använder innehållet.
 * routes: gateway -> { buss den hör på: [bussar den sänder vidare på] }.
 * block:  gateway som stoppar meddelandet.
 * then:   när noden tagit emot, starta nästa meddelande.
 */
export const MESSAGES = {
  eec1: {
    name: 'EEC1', title: 'Motorvarvtal', id: 0x0cf00400, from: 'ems', bus: 'pt', token: '--bus-pt',
    accept: ['tcm', 'ret', 'ebs', 'gw', 'icl', 'tel', 'bbm', 'body'],
    routes: { gw: { pt: ['cab', 'fms'] }, bbm: { cab: ['bb'] } },
  },
  erc1: {
    name: 'ERC1', title: 'Retarderns status', id: 0x18f00010, from: 'ret', bus: 'pt', token: '--accent',
    accept: ['ems', 'tcm', 'ebs', 'gw', 'icl', 'tel'],
    routes: { gw: { pt: ['cab', 'fms'] } },
  },
  tco1: {
    name: 'TCO1', title: 'Hastighet från färdskrivaren', id: 0x0cfe6cee, from: 'tco', bus: 'cab', token: '--bus-cab',
    accept: ['icl', 'gw', 'ems', 'tel'],
    routes: { gw: { cab: ['pt', 'fms'] } },
  },
  pto: {
    name: 'Varvtalsbegäran', title: 'Påbyggnaden ber om högre varvtal', from: 'body', bus: 'bb', token: '--bus-bb',
    accept: ['bbm', 'gw', 'ems'],
    routes: { bbm: { bb: ['cab'] }, gw: { cab: ['pt'] } },
  },
  junk: {
    name: 'Okänd ram', title: 'Påbyggnaden sänder något gatewayen inte känner till', from: 'body', bus: 'bb', token: '--bus-bb',
    accept: [],
    block: { bbm: true },
  },
  spak: {
    name: 'Spaken', title: 'Föraren drar i hjälpbromsspaken', wire: ['spak', 'gw'], token: '--muted',
    then: { gw: 'retreq' },
  },
  retreq: {
    name: 'Bromsbegäran', title: 'Begäran till retardern', from: 'gw', bus: 'pt', token: '--bus-cab',
    accept: ['ret'],
    then: { ret: 'erc1' },
  },

  // Närbilden
  wmsg: { name: 'Ram', from: 'wa', bus: 'wire', token: '--accent', accept: ['wb', 'wc'] },

  // Bänken
  b1: { name: 'Instrument 1', from: 'i1', bus: 'bench', token: '--bus-cab', accept: ['vn', 'pc'], routes: { vn: { bench: ['usb'] } } },
  b2: { name: 'Instrument 2', from: 'i2', bus: 'bench', token: '--bus-bb', accept: ['vn', 'pc'], routes: { vn: { bench: ['usb'] } } },
  b3: { name: 'Instrument 3', from: 'i3', bus: 'bench', token: '--bus-fms', accept: ['vn', 'pc'], routes: { vn: { bench: ['usb'] } } },
  bio: { name: 'I/O-modul', from: 'io', bus: 'bench', token: '--accent', accept: ['vn', 'pc'], routes: { vn: { bench: ['usb'] } } },
  lev: { name: 'Spakläge', wire: ['lever', 'io'], token: '--muted', then: { io: 'bio' } },
};

/** Vilka bussar ett meddelande når, och var det stoppas. */
export function reach(key) {
  const seen = new Set();
  const blockedAt = [];
  const walk = (k, viaBus, fromNode) => {
    const m = MESSAGES[k];
    if (m.wire) {
      for (const [node, next] of Object.entries(m.then ?? {})) walk(next, null, node);
      return;
    }
    const bus = viaBus ?? m.bus;
    if (seen.has(bus)) return;
    seen.add(bus);
    for (const node of BUSES[bus].nodes) {
      if (node === fromNode) continue;
      if (m.block?.[node]) blockedAt.push(node);
      for (const to of m.routes?.[node]?.[bus] ?? []) walk(k, to, node);
    }
  };
  walk(key, null, MESSAGES[key].from);
  return { buses: [...seen], blockedAt };
}

// --- J1939-uppslag (urval). Kontrollera alltid mot J1939 Digital Annex eller er DBC-fil. ---

export const PGNS = {
  0: { name: 'TSC1', text: 'Moment- och varvtalsstyrning (en nod ber en annan om moment eller varvtal)' },
  61440: { name: 'ERC1', text: 'Retarderns status: moment, läge, brytare' },
  61441: { name: 'EBC1', text: 'Bromssystemets status' },
  61443: { name: 'EEC2', text: 'Gaspedalläge och motorlast' },
  61444: { name: 'EEC1', text: 'Motorvarvtal och motormoment' },
  61445: { name: 'ETC2', text: 'Vald och aktuell växel' },
  65132: { name: 'TCO1', text: 'Färdskrivare: hastighet, förarstatus' },
  65262: { name: 'ET1', text: 'Motortemperaturer (kylvätska, olja, bränsle)' },
  65265: { name: 'CCVS1', text: 'Fordonshastighet, farthållare, bromspedal' },
  65266: { name: 'LFE1', text: 'Bränsleförbrukning' },
  65276: { name: 'DD1', text: 'Instrumentdata, till exempel bränslenivå' },
};

export const SOURCE_ADDRESSES = {
  0x00: { name: 'Motor nr 1', node: 'ems' },
  0x03: { name: 'Växellåda nr 1', node: 'tcm' },
  0x0b: { name: 'Bromsar, systemstyrenhet', node: 'ebs' },
  0x0f: { name: 'Retarder, motor' },
  0x10: { name: 'Retarder, drivlina', node: 'ret' },
  0x11: { name: 'Farthållare' },
  0x17: { name: 'Instrumentkluster', node: 'icl' },
  0x21: { name: 'Karosstyrenhet (body controller)', node: 'bbm' },
  0x29: { name: 'Retarder, avgasbroms' },
  0xee: { name: 'Färdskrivare', node: 'tco' },
  0xf9: { name: 'Diagnosverktyg' },
  0xfe: { name: 'Nulladress' },
  0xff: { name: 'Alla (global)' },
};

// start = bitposition räknat från bit 0 i byte 1 (Intel-ordning).
export const SIGNALS = {
  retTorqueMode: { spn: 900, name: 'Retarderns momentläge', start: 0, length: 4, discrete: true },
  retBrakeAssist: { spn: 571, name: 'Retarder aktiv via bromsassistans', start: 4, length: 2, discrete: true },
  retShiftAssist: { spn: 572, name: 'Retarder aktiv via växlingsassistans', start: 6, length: 2, discrete: true },
  retTorque: { spn: 520, name: 'Faktiskt retardermoment', start: 8, length: 8, scale: 1, offset: -125, unit: '%' },
  engSpeed: { spn: 190, name: 'Motorvarvtal', start: 24, length: 16, scale: 0.125, offset: 0, unit: 'r/min' },
  coolant: { spn: 110, name: 'Kylvätsketemperatur', start: 0, length: 8, scale: 1, offset: -40, unit: '°C' },
};
