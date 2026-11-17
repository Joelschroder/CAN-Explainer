// Ren CAN/J1939-logik utan DOM. Testas med `npm test`.

/** Dela upp ett 29-bitars J1939-ID i sina fält. */
export function decodeJ1939Id(id) {
  id = id >>> 0;
  const priority = (id >>> 26) & 0x7;
  const edp = (id >>> 25) & 1;
  const dp = (id >>> 24) & 1;
  const pf = (id >>> 16) & 0xff;
  const ps = (id >>> 8) & 0xff;
  const sa = id & 0xff;
  // PDU1 (PF < 240): PS är destinationsadress och ingår inte i PGN.
  // PDU2 (PF >= 240): PS är en del av PGN och meddelandet går till alla.
  const pdu1 = pf < 240;
  const pgn = (edp << 17) | (dp << 16) | (pf << 8) | (pdu1 ? 0 : ps);
  return { id, priority, edp, dp, pf, ps, sa, pdu1, pgn, da: pdu1 ? ps : 0xff };
}

export function encodeJ1939Id({ priority, pgn, sa, da = 0xff }) {
  const pf = (pgn >>> 8) & 0xff;
  const ps = pf < 240 ? da & 0xff : pgn & 0xff;
  return (((priority & 7) << 26) | (((pgn >>> 16) & 3) << 24) | (pf << 16) | (ps << 8) | (sa & 0xff)) >>> 0;
}

/** ID som bitar, mest signifikanta först (den ordning de sänds i). */
export function idBits(id, n = 29) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(Math.floor(id / 2 ** i) % 2);
  return out;
}

/**
 * Bitvis arbitrering. Bussen blir dominant (0) om någon aktiv nod sänder 0.
 * En nod som sänder 1 men läser 0 har förlorat och slutar sända.
 */
export function arbitrate(ids, n = 29) {
  const bits = ids.map((id) => idBits(id, n));
  const active = ids.map(() => true);
  const steps = [];
  for (let b = 0; b < n; b++) {
    const sent = bits.map((row, i) => (active[i] ? row[b] : null));
    const bus = sent.some((v) => v === 0) ? 0 : 1;
    const lost = [];
    sent.forEach((v, i) => {
      if (v !== null && v !== bus) {
        active[i] = false;
        lost.push(i);
      }
    });
    steps.push({ bit: b, sent, bus, lost });
  }
  const winners = active.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
  return { bits, steps, winners };
}

/**
 * Plocka ut ett råvärde ur datafältet. Intel-byteordning (little endian), som J1939.
 * startBit räknas från bit 0 = minst signifikanta biten i första byten.
 */
export function extractRaw(bytes, startBit, length) {
  let raw = 0;
  for (let i = 0; i < length; i++) {
    const pos = startBit + i;
    const bit = (bytes[pos >> 3] >> (pos & 7)) & 1;
    raw += bit * 2 ** i;
  }
  return raw;
}

export function insertRaw(bytes, startBit, length, raw) {
  const out = bytes.slice();
  for (let i = 0; i < length; i++) {
    const pos = startBit + i;
    const bit = Math.floor(raw / 2 ** i) % 2;
    out[pos >> 3] = bit ? out[pos >> 3] | (1 << (pos & 7)) : out[pos >> 3] & ~(1 << (pos & 7));
  }
  return out;
}

/**
 * J1939 reserverar de högsta råvärdena:
 *   2 bitar: 10 = fel, 11 = ej tillgänglig
 *   4 bitar: 1110 = fel, 1111 = ej tillgänglig
 *   1 byte:  0xFE = fel, 0xFF = ej tillgänglig, 0xFB–0xFD reserverat
 *   2 byte:  0xFExx = fel, 0xFFxx = ej tillgänglig, 0xFBxx–0xFDxx reserverat
 */
export function classifyRaw(raw, length) {
  if (length === 2) return raw === 2 ? 'error' : raw === 3 ? 'na' : 'ok';
  if (length === 4) return raw === 14 ? 'error' : raw === 15 ? 'na' : 'ok';
  if (length >= 8 && length % 8 === 0) {
    const top = Math.floor(raw / 2 ** (length - 8));
    if (top === 0xff) return 'na';
    if (top === 0xfe) return 'error';
    if (top >= 0xfb) return 'reserved';
  }
  return 'ok';
}

/** sig = { start, length, scale, offset, discrete } */
export function decodeSignal(bytes, sig) {
  const raw = extractRaw(bytes, sig.start, sig.length);
  const state = sig.length === 1 ? 'ok' : classifyRaw(raw, sig.length);
  const value = state === 'ok' && !sig.discrete ? raw * (sig.scale ?? 1) + (sig.offset ?? 0) : null;
  return { raw, state, value };
}

export function encodePhysical(value, sig) {
  return Math.round((value - (sig.offset ?? 0)) / (sig.scale ?? 1));
}

/** Resistans mellan CAN_H och CAN_L med strömmen av. */
export function measuredResistance(termA, termB) {
  if (termA && termB) return 60;
  if (termA || termB) return 120;
  return Infinity;
}

/**
 * Bedöm en bänkuppkoppling: instrument -> dosa -> interface.
 * cfg = { instruments, termA, termB, silent, bitrateMismatch, duplicateId }
 */
export function diagnoseBench(cfg) {
  const out = [];
  const r = measuredResistance(cfg.termA, cfg.termB);
  if (r === 60) {
    out.push({ level: 'ok', key: 'term', text: 'Terminering: 60 Ω mellan CAN_H och CAN_L. Rätt.' });
  } else if (r === 120) {
    out.push({
      level: 'warn',
      key: 'term',
      text: 'Terminering: 120 Ω, alltså bara ett motstånd. Det kan fungera på en kort bänkkabel men ger reflektioner. Sätt ett i varje ände.',
    });
  } else {
    out.push({
      level: 'bad',
      key: 'term',
      text: 'Terminering saknas. Bussen hinner inte tillbaka till recessiv nivå och ramarna blir trasiga.',
    });
  }

  if (cfg.silent && cfg.instruments < 2) {
    out.push({
      level: 'bad',
      key: 'ack',
      text: 'Ingen kvitterar. Interfacet lyssnar tyst och instrumentet är ensamt, så det får aldrig ACK. Det sänder om samma ram tills det ger upp. Stäng av tyst läge.',
    });
  } else if (cfg.silent) {
    out.push({
      level: 'ok',
      key: 'ack',
      text: 'Tyst läge fungerar här eftersom instrumenten kvitterar varandra. Interfacet påverkar inte bussen alls.',
    });
  } else {
    out.push({ level: 'ok', key: 'ack', text: 'Interfacet deltar på bussen och kvitterar (ACK) varje ram.' });
  }

  if (cfg.bitrateMismatch) {
    out.push({
      level: 'bad',
      key: 'bitrate',
      text: 'Olika bithastighet. Noden på 500 kbit/s tolkar 250-trafiken som fel och sänder error frames som förstör allas ramar. Alla noder på en buss måste ha samma hastighet.',
    });
  } else {
    out.push({ level: 'ok', key: 'bitrate', text: 'Samma bithastighet på alla noder.' });
  }

  if (cfg.duplicateId && cfg.instruments >= 2) {
    out.push({
      level: 'bad',
      key: 'id',
      text: 'Två instrument sänder samma ID. Sänder de samtidigt vinner båda arbitreringen och krockar i datafältet. Och även när det går bra kan applikationen inte se vem som sände. Byt källadress på det ena, eller ge dem var sin kanal på interfacet.',
    });
  } else {
    out.push({ level: 'ok', key: 'id', text: 'Varje ID sänds av exakt en nod.' });
  }
  return out;
}

export const hex = (n, width = 2) => n.toString(16).toUpperCase().padStart(width, '0');
export const bin = (n, width = 8) => n.toString(2).padStart(width, '0');
