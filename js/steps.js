// Kapitlen. Varje steg har text, en kameravy och eventuellt en interaktiv del.

import { h, segmented, toggle, scope, wiringExercise, quiz } from './ui.js';
import { arbitrate, decodeJ1939Id, decodeSignal, diagnoseBench, encodePhysical, extractRaw, insertRaw, measuredResistance, hex, bin } from './can.js';
import { BUSES, MESSAGES, NODES, PGNS, SIGNALS, SOURCE_ADDRESSES, reach } from './data.js';

const VIEW = {
  truck: { pos: [-5.3, 4.3, 8.9], target: [0.1, 1.85, 0] },
  cab: { pos: [-7.6, 3.9, 4.6], target: [-2.2, 1.8, 0] },
  retarder: { pos: [-4.4, 3.7, 6.4], target: [-0.9, 1.6, 0] },
  wire: { pos: [0, 2.2, 6.4], target: [0, 1.0, 0] },
  bench: { pos: [1.2, 3.3, 7.0], target: [1.4, 0.2, -0.6] },
  box: { pos: [-1.2, 3.0, 4.6], target: [0.3, 0.3, -0.8] },
};

const frameLine = (id, bytes) => `${hex(id, 8)}x  d 8  ${bytes.map((b) => hex(b)).join(' ')}`;

export const STEPS = [
  // ------------------------------------------------------------------ 1
  {
    id: 'intro',
    title: 'En lastbil är ett nätverk',
    body: `
      <p>En modern lastbil har tiotals styrenheter: motor, växellåda, bromsar, retarder, instrument, färdskrivare. De pratar med varandra över <strong>CAN</strong>, Controller Area Network.</p>
      <p>I 3D-vyn ser du en förenklad lastbil. Varje låda är en styrenhet. Varje färgad ledning är en CAN-buss. De lysande punkterna är meddelanden på väg.</p>
      <h2>Det här går vi igenom</h2>
      <ol>
        <li>Hur bussen fungerar elektriskt</li>
        <li>Hur ett meddelande ser ut och vem som får sända</li>
        <li>Hur lastbilens bussar hänger ihop via gateways</li>
        <li>Hur bitar blir mätvärden, digitala och analoga</li>
        <li>Er dosa, med tre delprov där du läser datablad och kopplar in</li>
      </ol>
      <p class="note">Bläddra med knapparna nedan eller med piltangenterna. Dra i 3D-vyn för att vrida den.</p>`,
    view: { group: 'truck', cam: VIEW.truck, rotate: true, ambient: ['eec1', 'tco1', 'erc1'], ambientEvery: 2.6 },
  },

  // ------------------------------------------------------------------ 2
  {
    id: 'buss',
    title: 'Varför en buss?',
    body: `
      <p>Utan buss behöver varje signal en egen ledning från sändare till mottagare. När alla enheter ska kunna nå varandra växer kablaget snabbt.</p>
      <p>Med CAN delar alla på <strong>samma två trådar</strong>. Alla hör allt som sägs, och varje enhet väljer själv vad den bryr sig om.</p>`,
    view: { group: 'truck', cam: VIEW.truck, buses: false, spaghetti: true },
    mount(el, world) {
      const { nodes, wires } = world.spaghettiStats;
      const readout = h('p', { class: 'readout' });
      const show = (mode) => {
        const p2p = mode === 'p2p';
        world.patchView({ spaghetti: p2p, buses: !p2p });
        readout.innerHTML = p2p
          ? `<b>${wires}</b> förbindelser mellan ${nodes} enheter, och en ny ledning för varje ny signal.`
          : `<b>2</b> trådar per buss. En ny enhet kopplas in på samma par.`;
      };
      el.append(segmented('Kablage', [{ value: 'p2p', label: 'Punkt till punkt' }, { value: 'bus', label: 'CAN-buss' }], 'p2p', show), readout);
      show('p2p');
    },
    after: `<p>Följden är viktig för resten: ett CAN-meddelande har ingen mottagaradress. Det har ett <strong>ID som säger vad det innehåller</strong>, och den som behöver innehållet lyssnar efter det ID:t.</p>`,
  },

  // ------------------------------------------------------------------ 3
  {
    id: 'tradar',
    title: 'Två tvinnade trådar',
    body: `
      <p>Bussen är ett tvinnat par: <b class="h">CAN_H</b> och <b class="l">CAN_L</b>. I J1939-kablage är CAN_H gul och CAN_L grön.</p>
      <p>Informationen ligger i <strong>skillnaden</strong> mellan trådarna, inte i spänningen mot jord. En störning träffar båda trådarna lika mycket och försvinner när man tar skillnaden.</p>
      <table class="mini">
        <tr><th>Nivå</th><th>Bit</th><th>CAN_H</th><th>CAN_L</th><th>Skillnad</th></tr>
        <tr><td>Recessiv</td><td>1</td><td>2,5 V</td><td>2,5 V</td><td>0 V</td></tr>
        <tr><td>Dominant</td><td>0</td><td>3,5 V</td><td>1,5 V</td><td>2 V</td></tr>
      </table>
      <h2>Terminering</h2>
      <p>I varje ände av bussen sitter 120 Ω mellan trådarna. Prova att ta bort dem.</p>`,
    view: { group: 'wire', cam: VIEW.wire, ambient: ['wmsg'], ambientEvery: 2.8 },
    mount(el, world) {
      let a = true;
      let b = true;
      const sc = scope('Oscilloskopbild av CAN_H och CAN_L');
      const ohm = h('p', { class: 'readout' });
      const verdict = h('p', { class: 'verdict' });
      const wave = (n) => {
        const bits = [1, 0, 1, 1, 0, 0, 1, 0, 1];
        const out = [];
        let d = 0;
        for (const bit of bits) {
          const target = bit ? 0 : 2;
          const start = d;
          for (let i = 0; i < 36; i++) {
            const t = i / 36;
            if (n === 2) d = target + (start - target) * Math.exp(-t / 0.035);
            else if (n === 1) d = target + (start - target) * Math.exp(-t / 0.17) * Math.cos(2 * Math.PI * 4 * t);
            else if (target > start) d = target + (start - target) * Math.exp(-t / 0.12) * Math.cos(2 * Math.PI * 5 * t);
            else d = target + (start - target) * Math.exp(-t / 0.8);
            out.push(d);
          }
        }
        return out;
      };
      const update = () => {
        world.setWire({ termA: a, termB: b });
        const r = measuredResistance(a, b);
        const n = (a ? 1 : 0) + (b ? 1 : 0);
        ohm.innerHTML = `Multimeter mellan CAN_H och CAN_L, strömmen av: <b>${r === Infinity ? 'flera kΩ' : `${r} Ω`}</b>`;
        verdict.className = `verdict ${['bad', 'warn', 'ok'][n]}`;
        verdict.textContent = [
          'Ingen terminering. Bussen laddas ur för långsamt och hinner inte tillbaka till recessiv nivå innan nästa bit. Mottagarna läser fel.',
          'Ett motstånd. Signalen studsar i den öppna änden och ringer efter varje flank. Kan fungera på kort kabel, men inte att lita på.',
          'Två motstånd, 60 Ω totalt. Rena flanker.',
        ][n];
        sc.draw(wave(n));
      };
      el.append(
        h('div', { class: 'row' }, toggle('term-a', '120 Ω vänster ände', a, (v) => ((a = v), update())), toggle('term-b', '120 Ω höger ände', b, (v) => ((b = v), update()))),
        sc.canvas,
        ohm,
        verdict,
      );
      requestAnimationFrame(update);
      const ro = new ResizeObserver(update);
      ro.observe(sc.canvas);
      return () => (ro.disconnect(), world.setWire({ termA: true, termB: true }));
    },
    after: `<p class="note">Praktiskt test: mät mellan CAN_H och CAN_L med allt strömlöst. 60 Ω betyder två terminatorer. 120 Ω betyder att en saknas. 40 Ω betyder att det sitter tre.</p>`,
  },

  // ------------------------------------------------------------------ 4
  {
    id: 'dominant',
    title: 'Dominant vinner',
    body: `
      <p>Alla noder sitter parallellt på samma par. En nod som sänder <strong>0</strong> drar isär trådarna (dominant). En nod som sänder <strong>1</strong> gör ingenting alls (recessiv).</p>
      <p>Räcker det att en enda nod sänder 0 så blir bussen 0, vad de andra än gör. Låt noderna sända och se vad som händer på tråden.</p>`,
    view: { group: 'wire', cam: VIEW.wire },
    mount(el, world) {
      const state = { wa: false, wb: false, wc: false };
      const sc = scope('Bussnivån i realtid');
      const out = h('p', { class: 'readout' });
      const hist = new Array(180).fill(0);
      let level = 0;
      let raf;
      const sync = () => {
        const dominant = Object.values(state).some(Boolean);
        world.setWire({ dominant, driving: state });
        out.innerHTML = dominant
          ? `Bussen: <b>dominant (0)</b>. Noder som sänder 1 läser ändå 0.`
          : `Bussen: <b>recessiv (1)</b>. Ingen drar i trådarna.`;
      };
      const loop = () => {
        const target = Object.values(state).some(Boolean) ? 2 : 0;
        level += (target - level) * 0.45;
        hist.push(level);
        hist.shift();
        sc.draw(hist);
        raf = requestAnimationFrame(loop);
      };
      const names = { wa: 'Nod A', wb: 'Nod B', wc: 'Nod C' };
      el.append(
        h('div', { class: 'row' }, Object.keys(state).map((k) => toggle(`drive-${k}`, `${names[k]} sänder 0`, false, (v) => ((state[k] = v), sync())))),
        sc.canvas,
        out,
      );
      sync();
      loop();
      return () => (cancelAnimationFrame(raf), world.setWire({ dominant: false, driving: { wa: false, wb: false, wc: false } }));
    },
    after: `<p>Varje nod läser hela tiden tillbaka vad som faktiskt ligger på bussen. Sänder den 1 men läser 0 vet den att någon annan också sänder. Det utnyttjas i arbitreringen, två steg fram.</p>`,
  },

  // ------------------------------------------------------------------ 5
  {
    id: 'ram',
    title: 'En CAN-ram',
    body: `
      <p>Data skickas i <strong>ramar</strong>. En klassisk CAN-ram bär högst 8 byte. Lastbilar använder utökat format med 29 bitars ID. Klicka på fälten.</p>`,
    view: { group: 'wire', cam: VIEW.wire, ambient: ['wmsg'], ambientEvery: 2.4 },
    mount(el) {
      const fields = [
        { k: 'sof', name: 'SOF', bits: '1', grow: 1, t: 'Start of frame', d: 'En enda dominant bit. Alla noder synkar sina klockor på flanken.' },
        { k: 'id', name: 'ID', bits: '29', grow: 6, t: 'Identifierare', d: 'Säger vad ramen innehåller och avgör prioriteten. Standardformat har 11 bitar, utökat format 29. J1939 i lastbilar använder alltid 29.' },
        { k: 'ctl', name: 'Styrbitar', bits: '3', grow: 2, t: 'RTR, IDE med flera', d: 'Talar om att det är en dataram i utökat format. I en logg från Vector syns det som ett x efter ID:t och ett d för dataram.' },
        { k: 'dlc', name: 'DLC', bits: '4', grow: 2, t: 'Data length code', d: 'Antal databyte, 0 till 8. I J1939 nästan alltid 8. Byte som inte används fylls med FF.' },
        { k: 'data', name: 'Data', bits: '0–64', grow: 7, t: 'Datafältet', d: 'Själva innehållet, upp till 8 byte. Här ligger signalerna packade bit för bit. Hur de läses ut kommer i kapitlet Från bitar till mätvärde.' },
        { k: 'crc', name: 'CRC', bits: '16', grow: 3, t: 'Kontrollsumma', d: 'Sändaren räknar en kontrollsumma över ramen. Mottagarna räknar samma sak. Stämmer den inte sänder de en error frame och sändaren försöker igen.' },
        { k: 'ack', name: 'ACK', bits: '2', grow: 2, t: 'Kvittens', d: 'Sändaren lämnar en recessiv lucka. Varje nod som tagit emot ramen korrekt fyller luckan med en dominant bit. Uteblir den vet sändaren att ingen hörde och sänder om. En nod som är ensam på bussen kan därför aldrig sända färdigt.' },
        { k: 'eof', name: 'EOF', bits: '7', grow: 2, t: 'End of frame', d: 'Sju recessiva bitar avslutar ramen. Efter tre bitars paus får nästa ram börja.' },
      ];
      const detail = h('div', { class: 'detail', role: 'status' });
      const example = h('p', { class: 'trace' });
      const bar = h('div', { class: 'framebar', role: 'group', 'aria-label': 'Ramens fält' });
      const select = (k) => {
        const f = fields.find((x) => x.k === k);
        [...bar.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
        detail.innerHTML = `<h3>${f.t} <span>${f.bits} bitar</span></h3><p>${f.d}</p>`;
        const m = (key, text) => `<span class="${k === key ? 'hit' : ''}">${text}</span>`;
        example.innerHTML = `${m('id', '0CF00400')}${m('ctl', 'x&nbsp; d')} ${m('dlc', '8')}&nbsp; ${m('data', 'F0 7D 7D 60 22 00 F0 7D')}`;
      };
      fields.forEach((f) => {
        bar.append(h('button', { type: 'button', 'data-k': f.k, style: `flex-grow:${f.grow}`, onclick: () => select(f.k) }, h('b', {}, f.name), h('span', {}, f.bits)));
      });
      el.append(bar, detail, h('p', { class: 'caption' }, 'Samma ram som den ser ut i en logg:'), example);
      select('id');
    },
    after: `<p class="note">Efter fem likadana bitar i rad stoppar sändaren in en motsatt bit (bit stuffing). Då får mottagarna alltid flanker att hålla takten på. Mottagaren plockar bort dem igen, så det syns aldrig i er applikation.</p>`,
  },

  // ------------------------------------------------------------------ 6
  {
    id: 'arbitrering',
    title: 'Vem får prata?',
    body: `
      <p>Ingen delar ut turordning. En nod som vill sända väntar tills bussen är ledig och börjar sedan med sitt ID, högsta biten först.</p>
      <p>Börjar flera samtidigt jämförs ID:na bit för bit direkt på tråden. Den som sänder 1 men läser 0 har förlorat och tystnar. Vinnaren märker ingenting och sänder vidare, så ingen tid går förlorad.</p>`,
    view: { group: 'wire', cam: VIEW.wire },
    mount(el, world) {
      const names = ['A', 'B', 'C'];
      const nodeIds = ['wa', 'wb', 'wc'];
      const ids = [0x0cfe6cee, 0x18f00010, 0x0cf00400];
      let k = 0;
      let timer;
      const inputs = ids.map((id, i) => {
        const input = h('input', { type: 'text', class: 'hexin', id: `arb-id-${i}`, value: hex(id, 8), maxlength: 8, spellcheck: 'false', 'aria-label': `ID för nod ${names[i]} (hex)` });
        input.addEventListener('change', () => {
          const v = parseInt(input.value, 16);
          if (Number.isNaN(v) || v < 0 || v > 0x1fffffff) input.value = hex(ids[i], 8);
          else ids[i] = v;
          input.value = hex(ids[i], 8);
          restart();
        });
        return h('label', { class: 'field', for: `arb-id-${i}` }, h('span', {}, `Nod ${names[i]}`), input);
      });
      const table = h('div', { class: 'bits', role: 'img', 'aria-label': 'ID-bitarna för varje nod och resultatet på bussen' });
      const status = h('p', { class: 'readout', role: 'status' });

      const render = () => {
        const res = arbitrate(ids);
        const lostAt = ids.map((_, i) => res.steps.findIndex((s) => s.lost.includes(i)));
        const row = (label, cells, cls = '') => `<div class="brow ${cls}"><b>${label}</b>${cells.join('')}</div>`;
        const rows = ids.map((_, i) =>
          row(
            names[i],
            res.bits[i].map((bit, b) => {
              if (b >= k) return '<i class="todo">·</i>';
              if (lostAt[i] >= 0 && b > lostAt[i]) return '<i class="quiet">–</i>';
              return `<i class="${lostAt[i] === b ? 'lost' : bit ? 'r' : 'd'}">${bit}</i>`;
            }),
            lostAt[i] >= 0 && lostAt[i] < k ? 'out' : '',
          ),
        );
        rows.push(row('Buss', res.steps.map((s, b) => (b >= k ? '<i class="todo">·</i>' : `<i class="${s.bus ? 'r' : 'd'}">${s.bus}</i>`)), 'busrow'));
        table.innerHTML = rows.join('');

        const driving = {};
        const last = k > 0 ? res.steps[k - 1] : null;
        nodeIds.forEach((nid, i) => {
          const out = lostAt[i] >= 0 && lostAt[i] < k;
          driving[nid] = out ? false : last && last.lost.includes(i) ? '--bad' : k > 0;
        });
        world.setWire({ dominant: last ? last.bus === 0 : false, driving });

        if (k === 0) status.textContent = 'Alla tre börjar sända samtidigt. Stega fram bit för bit.';
        else if (k === 29) {
          const w = res.winners;
          status.innerHTML = w.length === 1
            ? `<b>Nod ${names[w[0]]} vann</b> med ID ${hex(ids[w[0]], 8)}, det lägsta talet. De andra försöker igen direkt när ramen är klar.`
            : `<b>Oavgjort mellan ${w.map((i) => names[i]).join(' och ')}.</b> Samma ID från två noder. Båda fortsätter in i datafältet och krockar där. Därför får ett ID bara ha en sändare.`;
        } else if (last.lost.length) {
          status.innerHTML = `Bit ${k}: <b>nod ${last.lost.map((i) => names[i]).join(' och ')}</b> sände 1 men läste 0. Den slutar sända och lyssnar i stället.`;
        } else {
          status.textContent = `Bit ${k}: alla som är kvar sände samma sak. Ingen märker något.`;
        }
      };
      const stop = () => (clearInterval(timer), (timer = null));
      const restart = () => (stop(), (k = 0), render());
      const step = () => {
        if (k < 29) k++;
        if (k === 29) stop();
        render();
      };
      el.append(
        h('div', { class: 'row fields' }, inputs),
        h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', class: 'btn primary', onclick: () => (stop(), step()) }, 'Nästa bit'),
          h('button', { type: 'button', class: 'btn', onclick: () => (stop(), k >= 29 && (k = 0), (timer = setInterval(step, 240))) }, 'Spela'),
          h('button', { type: 'button', class: 'btn', onclick: restart }, 'Börja om'),
        ),
        h('div', { class: 'scrollx' }, table),
        status,
      );
      render();
      return () => (stop(), world.setWire({ dominant: false, driving: { wa: false, wb: false, wc: false } }));
    },
    after: `<p><strong>Lägst ID vinner.</strong> Lågt ID betyder alltså hög prioritet. Prova att ge två noder samma ID och se varför det inte är tillåtet.</p>`,
  },

  // ------------------------------------------------------------------ 7
  {
    id: 'j1939',
    title: 'J1939: ID:t berättar vad det är',
    body: `
      <p>CAN bestämmer bara hur ramar skickas. Vad de betyder bestäms av ett protokoll ovanpå. I tunga fordon är det <strong>SAE J1939</strong>, som delar upp de 29 ID-bitarna i fält:</p>
      <ul>
        <li><strong>Prioritet</strong>, 3 bitar. 0 är högst.</li>
        <li><strong>PGN</strong>, Parameter Group Number. Vilket meddelande det är.</li>
        <li><strong>Källadress</strong>, 8 bitar. Vem som sänder.</li>
      </ul>
      <p>Skriv in ett ID från en logg, eller välj ett exempel.</p>`,
    view: { group: 'truck', cam: VIEW.truck, ambient: [] },
    mount(el, world) {
      const input = h('input', { type: 'text', class: 'hexin wide', id: 'j1939-id', value: '18F00010', maxlength: 8, spellcheck: 'false', 'aria-label': '29-bitars ID i hex' });
      const bar = h('div', { class: 'idbar' });
      const out = h('dl', { class: 'facts' });
      const presets = [
        ['0CF00400', 'EEC1 från motorn'],
        ['18F00010', 'ERC1 från retardern'],
        ['18FEF100', 'CCVS1 från motorn'],
        ['0CFE6CEE', 'TCO1 från färdskrivaren'],
        ['0C00100B', 'TSC1 till retardern'],
      ];
      const decode = () => {
        const v = parseInt(input.value, 16);
        if (Number.isNaN(v) || v > 0x1fffffff || !/^[0-9a-fA-F]{1,8}$/.test(input.value.trim())) {
          out.innerHTML = '<dt>Fel</dt><dd>Skriv ett hexadecimalt tal mellan 0 och 1FFFFFFF.</dd>';
          bar.replaceChildren();
          return;
        }
        const d = decodeJ1939Id(v);
        const cell = (name, value, bits, cls) => `<div class="${cls}" style="flex-grow:${bits}"><span>${name}</span><b>${value}</b><i>${bits} bit</i></div>`;
        bar.innerHTML =
          cell('Prio', d.priority, 3, 'f-prio') +
          cell('R, DP', `${d.edp}${d.dp}`, 2, 'f-dp') +
          cell('PF', hex(d.pf), 8, 'f-pgn') +
          cell(d.pdu1 ? 'PS = mål' : 'PS', hex(d.ps), 8, d.pdu1 ? 'f-da' : 'f-pgn') +
          cell('Källa', hex(d.sa), 8, 'f-sa');
        const pgn = PGNS[d.pgn];
        const sa = SOURCE_ADDRESSES[d.sa];
        const da = SOURCE_ADDRESSES[d.da];
        out.innerHTML = `
          <dt>Prioritet</dt><dd>${d.priority}${d.priority <= 3 ? ' (hög, typiskt för styrning)' : d.priority >= 6 ? ' (normal, typiskt för statusdata)' : ''}</dd>
          <dt>PGN</dt><dd>${d.pgn} (0x${hex(d.pgn, 4)})${pgn ? `: <b>${pgn.name}</b>. ${pgn.text}.` : '. Finns inte i den här sidans lilla tabell. Slå upp i J1939 Digital Annex eller er DBC.'}</dd>
          <dt>Sänds av</dt><dd>0x${hex(d.sa)}${sa ? `: ${sa.name}` : ' (okänd adress här)'}</dd>
          <dt>Till</dt><dd>${d.pdu1 ? `Adress 0x${hex(d.da)}${da ? `, ${da.name}` : ''}. PF under F0 betyder riktat meddelande.` : 'Alla. PF från F0 och uppåt betyder att PS hör till PGN och ramen går ut till alla.'}</dd>`;
        const hl = [sa?.node, d.pdu1 ? da?.node : null].filter(Boolean);
        world.patchView({ highlight: hl.length ? hl : null });
      };
      input.addEventListener('input', decode);
      el.append(
        h('label', { class: 'field', for: 'j1939-id' }, h('span', {}, 'ID (hex)'), input),
        h('div', { class: 'chips' }, presets.map(([v, label]) => h('button', { type: 'button', class: 'chip', onclick: () => ((input.value = v), decode()) }, label))),
        bar,
        out,
      );
      decode();
      return () => world.patchView({ highlight: null });
    },
    after: `
      <p>Varje PGN innehåller en eller flera signaler. J1939 kallar en signal för <strong>SPN</strong>, Suspect Parameter Number. Motorvarvtal är till exempel SPN 190 och ligger i PGN 61444.</p>
      <p class="note">J1939 kör normalt 250 kbit/s, nyare fordon 500 kbit/s. Alla noder på en buss måste ha samma hastighet.</p>`,
  },

  // ------------------------------------------------------------------ 8
  {
    id: 'gateways',
    title: 'Flera bussar, gateways emellan',
    body: `
      <p>En lastbil har flera bussar, inte en. Det finns tre skäl:</p>
      <ul>
        <li><strong>Last.</strong> En buss rymmer bara en viss mängd trafik.</li>
        <li><strong>Säkerhet.</strong> Ett fel på en komfortbuss får inte slå ut bromsarna.</li>
        <li><strong>Åtkomst.</strong> Påbyggare och telematik ska kunna läsa data utan att kunna störa drivlinan.</li>
      </ul>
      <p>En <strong>gateway</strong> sitter på två eller flera bussar. Den tar emot en ram på ena sidan och sänder en ny på den andra, men bara för de meddelanden som står i dess tabell. Skicka ett meddelande och följ det.</p>`,
    view: { group: 'truck', cam: VIEW.truck },
    mount(el, world) {
      const info = h('div', { class: 'detail', role: 'status' });
      const keys = ['eec1', 'erc1', 'tco1', 'spak', 'pto', 'junk'];
      const text = {
        eec1: 'Motorn sänder varvtalet på drivlinebussen. Den centrala gatewayen kopierar det till hyttbussen, där instrumentet visar det, och till FMS-utgången. Påbyggnadsgatewayen släpper det vidare till påbyggnaden.',
        erc1: 'Retardern berättar hur hårt den bromsar. Det går vidare till hytten och FMS. Påbyggnadsgatewayen har det inte i sin tabell, så påbyggnadsbussen får aldrig se det.',
        tco1: 'Färdskrivaren sitter på hyttbussen. Motorn behöver hastigheten, så gatewayen sänder ramen vidare till drivlinan.',
        spak: 'Spaken pratar inte CAN. Den har vanliga ledningar till en styrenhet i hytten. Styrenheten läser läget och sänder en bromsbegäran på CAN. Retardern svarar med sin status i ERC1.',
        pto: 'Påbyggnaden ber om högre varvtal, till exempel för en kran. Påbyggnadsgatewayen kontrollerar begäran och översätter den innan den når motorn.',
        junk: 'Påbyggnadsgatewayen känner inte igen ramen och släpper inte igenom den. Den fungerar som brandvägg mot resten av fordonet.',
      };
      const show = (key) => {
        world.send(key);
        const r = reach(key);
        const chips = Object.entries(BUSES)
          .filter(([, b]) => b.group === 'truck')
          .map(([id, b]) => `<span class="reach ${r.buses.includes(id) ? 'yes' : 'no'}" style="--c:var(${b.token})">${r.buses.includes(id) ? '✓' : '✗'} ${b.name}</span>`)
          .join('');
        const m = MESSAGES[key];
        info.innerHTML = `<h3>${m.title}</h3><p>${text[key]}</p><p class="reachrow">${key === 'spak' ? '<span class="reach yes" style="--c:var(--muted)">✓ Vanlig ledning</span><span class="reach yes" style="--c:var(--bus-pt)">✓ Drivlina</span>' : chips}</p>`;
        [...list.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === key)));
      };
      const list = h('div', { class: 'chips' }, keys.map((k) => h('button', { type: 'button', class: 'chip', 'data-k': k, onclick: () => show(k) }, MESSAGES[k].name)));
      el.append(list, info);
      show('eec1');
    },
    after: `
      <p><strong>För er betyder det:</strong> vad ni ser beror på var ni kopplar in. På en FMS- eller påbyggnadsutgång finns bara det som gatewayen släpper igenom, ibland med annan takt än på ursprungsbussen.</p>
      <p class="note">Bussarnas namn och antal skiljer mellan tillverkare. Scania har till exempel en röd, en gul och en grön buss med koordinatorn som gateway. Bilden här är en förenkling.</p>`,
  },

  // ------------------------------------------------------------------ 9
  {
    id: 'signaler',
    title: 'Från bitar till mätvärde',
    body: `
      <p>Datafältet är bara 8 byte. Databladet eller DBC-filen talar om var varje signal ligger och hur den räknas om.</p>
      <p><strong>Digitala signaler</strong> är lägen: av eller på, växel, driftläge. I J1939 får en brytare 2 bitar, så att den också kan säga fel och ej tillgänglig.</p>
      <p><strong>Analoga signaler</strong> är mätvärden: moment, varvtal, tryck. De skickas nästan aldrig som flyttal. De skickas som <strong>heltal med skala och offset</strong>:</p>
      <p class="formula">värde = råvärde × skala + offset</p>
      <p>Flyttalet uppstår först i er applikation, efter omräkningen.</p>`,
    view: { group: 'truck', cam: VIEW.retarder, ambient: ['erc1', 'eec1'], ambientEvery: 2.2 },
    mount(el) {
      const host = h('div');
      const erc1 = () => {
        let bytes = [0xf1, 0x55, 0x7d, 0xff, 0xff, 0xff, 0xff, 0xff];
        bytes = insertRaw(bytes, 0, 4, 1);
        bytes = insertRaw(bytes, 4, 2, 1);
        const S = SIGNALS;
        const trace = h('p', { class: 'trace' });
        const bits = h('div', { class: 'bytebits' });
        const calc = h('div', { class: 'calc' });
        const slider = h('input', { type: 'range', id: 'ret-torque', min: -125, max: 0, step: 1, value: -40 });
        const sw = h('select', { id: 'ret-switch' }, ['00 – av', '01 – på', '10 – fel', '11 – ej tillgänglig'].map((t, i) => h('option', { value: i }, t)));
        sw.value = '1';
        const special = (label, raw) => h('button', { type: 'button', class: 'chip', onclick: () => ((bytes = insertRaw(bytes, 8, 8, raw)), render()) }, label);
        const stateText = { ok: '', error: 'Fel från givaren. Räkna inte om, visa fel.', na: 'Ej tillgänglig. Sändaren har inte signalen.', reserved: 'Reserverat värde.' };
        const render = () => {
          const t = decodeSignal(bytes, S.retTorque);
          const b = decodeSignal(bytes, S.retBrakeAssist);
          const mode = decodeSignal(bytes, S.retTorqueMode);
          trace.innerHTML = `18F00010x&nbsp; d 8&nbsp; <span class="c-dig">${hex(bytes[0])}</span> <span class="c-ana">${hex(bytes[1])}</span> ${bytes.slice(2).map((x) => hex(x)).join(' ')}`;
          const b0 = bin(bytes[0]);
          bits.innerHTML = `
            <p class="caption">Byte 1 uppdelad i bitar (bit 8 till vänster):</p>
            <div class="bitrow">
              <span class="grp g3" style="flex:2"><b>${b0.slice(0, 2)}</b><i>bit 8–7<br>växlingsassistans</i></span>
              <span class="grp g2" style="flex:2"><b>${b0.slice(2, 4)}</b><i>bit 6–5<br>bromsassistans</i></span>
              <span class="grp g1" style="flex:4"><b>${b0.slice(4)}</b><i>bit 4–1<br>momentläge</i></span>
            </div>`;
          calc.innerHTML = `
            <h3 class="c-dig">Digitalt: bromsassistansbrytaren (SPN 571)</h3>
            <p>Bit 6–5 i byte 1 = <code>${bin(b.raw, 2)}</code> → <b>${['av', 'på', 'fel', 'ej tillgänglig'][b.raw]}</b></p>
            <p>Momentläge, bit 4–1 = <code>${bin(mode.raw, 4)}</code> → läge ${mode.raw}</p>
            <h3 class="c-ana">Analogt: faktiskt retardermoment (SPN 520)</h3>
            <p>Byte 2 = <code>0x${hex(t.raw)}</code> = ${t.raw} som heltal</p>
            ${t.state === 'ok' ? `<p>${t.raw} × 1 + (−125) = <b>${String(t.value).replace('-', '−')} %</b></p>` : `<p class="warnline"><b>${stateText[t.state]}</b></p>`}`;
          if (t.state === 'ok' && t.value <= 0) slider.value = t.value;
        };
        slider.addEventListener('input', () => ((bytes = insertRaw(bytes, 8, 8, encodePhysical(Number(slider.value), S.retTorque))), render()));
        sw.addEventListener('change', () => ((bytes = insertRaw(bytes, 4, 2, Number(sw.value))), render()));
        host.replaceChildren(
          h('label', { class: 'field stack', for: 'ret-torque' }, h('span', {}, 'Bromsmoment (negativt = bromsar)'), slider),
          h('div', { class: 'row' }, h('label', { class: 'field', for: 'ret-switch' }, h('span', {}, 'Brytare'), sw), special('Sätt FE (fel)', 0xfe), special('Sätt FF (saknas)', 0xff)),
          trace,
          bits,
          calc,
          h('p', { class: 'note' }, 'Skala 1 %/bit och offset −125 gör att en byte utan tecken kan bära −125 till +125 %. Råvärde 125 är noll moment.'),
        );
        render();
      };
      const eec1 = () => {
        let bytes = [0xf0, 0x7d, 0x7d, 0x60, 0x22, 0x00, 0xf0, 0x7d];
        const S = SIGNALS.engSpeed;
        const trace = h('p', { class: 'trace' });
        const calc = h('div', { class: 'calc' });
        const slider = h('input', { type: 'range', id: 'eng-rpm', min: 0, max: 2500, step: 12.5, value: 1100 });
        const render = () => {
          const s = decodeSignal(bytes, S);
          trace.innerHTML = `0CF00400x&nbsp; d 8&nbsp; ${bytes.slice(0, 3).map((x) => hex(x)).join(' ')} <span class="c-ana">${hex(bytes[3])} ${hex(bytes[4])}</span> ${bytes.slice(5).map((x) => hex(x)).join(' ')}`;
          calc.innerHTML = `
            <h3 class="c-ana">Analogt, 16 bitar: motorvarvtal (SPN 190)</h3>
            <p>Byte 4 = <code>0x${hex(bytes[3])}</code> (låg), byte 5 = <code>0x${hex(bytes[4])}</code> (hög)</p>
            <p>Råvärde = byte 5 × 256 + byte 4 = <code>0x${hex(s.raw, 4)}</code> = ${s.raw}</p>
            <p>${s.raw} × 0,125 = <b>${String(s.value).replace('.', ',')} r/min</b></p>
            <p class="warnline">Läst i fel ordning hade det blivit 0x${hex(bytes[3] * 256 + bytes[4], 4)} = ${String((bytes[3] * 256 + bytes[4]) * 0.125).replace('.', ',')} r/min.</p>`;
        };
        slider.addEventListener('input', () => ((bytes = insertRaw(bytes, S.start, S.length, encodePhysical(Number(slider.value), S))), render()));
        host.replaceChildren(
          h('label', { class: 'field stack', for: 'eng-rpm' }, h('span', {}, 'Varvtal'), slider),
          trace,
          calc,
          h('p', { class: 'note' }, 'J1939 skickar minst signifikanta byten först (Intel-ordning, little endian). Det är den vanligaste orsaken till konstiga värden. Med 0,125 r/min per bit räcker 16 bitar till drygt 8 000 r/min.'),
        );
        render();
      };
      el.append(segmented('Exempel', [{ value: 'erc1', label: 'Retardern (ERC1)' }, { value: 'eec1', label: 'Varvtal (EEC1)' }], 'erc1', (v) => (v === 'erc1' ? erc1() : eec1())), host);
      erc1();
    },
    after: `
      <h2>Tre saker att kontrollera för varje signal</h2>
      <ol>
        <li><strong>Var:</strong> startbit och längd.</li>
        <li><strong>Hur:</strong> skala, offset, enhet och byteordning.</li>
        <li><strong>Specialvärden:</strong> FE betyder fel och FF betyder ej tillgänglig. Sortera bort dem innan ni räknar om, annars visar ni 130 % retardermoment.</li>
      </ol>`,
  },

  // ------------------------------------------------------------------ 10
  {
    id: 'bokstaven-d',
    title: 'Vad betyder D i databladet?',
    body: `
      <p>Det beror på var D:et står. Här är de betydelser som är vanliga i den här miljön. Välj den som liknar ert datablad.</p>`,
    view: { group: 'bench', cam: VIEW.bench, ambient: ['b1', 'b2', 'b3'], ambientEvery: 1.6 },
    mount(el) {
      const cases = [
        {
          k: 'pin', label: 'Vid en pinne: D, DI, DO, D1',
          t: 'Digital in- eller utgång',
          d: 'Pinnen är antingen hög eller låg, till exempel ett brytarläge. Motsatsen är A, AI eller AO för analog, där spänningen eller strömmen varierar steglöst (0–5 V, 4–20 mA). En sådan pinne är inte CAN. Den ska till en digital ingång, inte till bussen.',
          ex: 'Pin 3  D1   Switch output, position 1\nPin 6  A    Analog out 0.5–4.5 V',
        },
        {
          k: 'deutsch', label: 'Som pinnbokstav: A, B, C, D …',
          t: 'Pinne D i en kontakt med bokstäver',
          d: 'Runda Deutsch-kontakter märker pinnarna med bokstäver. I den 9-poliga diagnoskontakten för J1939 är C = CAN_H och D = CAN_L. Då är D bara en plats i kontakten, inte en signaltyp.',
          ex: 'A  Jord\nB  Batteri +\nC  CAN_H\nD  CAN_L\nE  Skärm',
        },
        {
          k: 'trace', label: 'I en logg: d 8',
          t: 'Dataram',
          d: 'I Vectors loggar (CANoe, CANalyzer, ASC-filer) står ett d före DLC. Det betyder dataram, till skillnad från r för remote frame. Siffran efter är antalet databyte.',
          ex: '0.0167  1  0CF00400x  Rx  d 8  F0 7D 7D 60 22 00 F0 7D',
        },
        {
          k: 'bit', label: 'Vid en bit: d och r',
          t: 'Dominant',
          d: 'När en specifikation beskriver ramens bitar står d för dominant (logisk 0) och r för recessiv (logisk 1). SOF-biten är till exempel alltid d.',
          ex: 'SOF  1 bit  d\nEOF  7 bit  r',
        },
        {
          k: 'dlc', label: 'DLC, eller en kolumn D0–D7',
          t: 'Datalängd eller databyte',
          d: 'DLC är Data Length Code, antalet databyte i ramen. D0 till D7 (ibland Data0–7) är de åtta databytena i tur och ordning. Se upp: vissa datablad räknar från byte 0, J1939 räknar från byte 1.',
          ex: 'ID        DLC  D0 D1 D2 D3 D4 D5 D6 D7\n18F00010   8   F1 55 7D FF FF FF FF FF',
        },
        {
          k: 'type', label: 'I en datatyp: D, DW, DINT',
          t: 'Dubbelord eller double',
          d: 'I signaltabeller kan D stå för double word (32 bitar), DINT (32-bitars heltal) eller double (64-bitars flyttal). Jämför med signalens längd i bitar, så ser ni vilket det är.',
          ex: 'Signal    Type  Bits\nPosition  D     32',
        },
        {
          k: 'dsub', label: 'D-sub, DB9, DE-9',
          t: 'Kontaktens form',
          d: 'D:et beskriver det D-formade skalet på kontakten. CAN-interface har ofta en 9-polig D-sub där pin 2 = CAN_L, pin 7 = CAN_H och pin 3 = jord.',
          ex: 'Pin 2  CAN_L\nPin 3  CAN_GND\nPin 7  CAN_H',
        },
      ];
      const detail = h('div', { class: 'detail', role: 'status' });
      const select = (k) => {
        const c = cases.find((x) => x.k === k);
        [...list.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
        detail.replaceChildren(h('h3', {}, c.t), h('p', {}, c.d), h('pre', { class: 'trace' }, c.ex));
      };
      const list = h('div', { class: 'chips col' }, cases.map((c) => h('button', { type: 'button', class: 'chip', 'data-k': c.k, onclick: () => select(c.k) }, c.label)));
      el.append(list, detail);
      select('pin');
    },
    after: `
      <p><strong>Min gissning för er:</strong> står D:et i en pinnlista bredvid ett A är det digital och analog utgång. Det stämmer med en hjälpbromsspak, som ofta ger lägen på vanliga ledningar i stället för CAN. Delprov 2 handlar om just det fallet.</p>
      <p class="note">Skicka gärna databladet, så går det att säga säkert.</p>`,
  },

  // ------------------------------------------------------------------ 11
  {
    id: 'dosan',
    title: 'Er dosa',
    body: `
      <p>Tanken: flera instrument kopplas in i en dosa, hamnar på samma buss och går vidare via ett Vector-interface till er applikation.</p>
      <p>”Seriekoppla” betyder här bara att kabeln går från kontakt till kontakt. Elektriskt sitter alla CAN_H ihop och alla CAN_L ihop. Det är <strong>en parallellkoppling</strong>. Ingen nod skickar vidare till nästa, alla sitter på samma tråd.</p>
      <p>Ändra uppkopplingen och se vad som går sönder.</p>`,
    view: { group: 'bench', cam: VIEW.bench, ambient: ['b1', 'b2', 'b3'], ambientEvery: 1.3 },
    mount(el, world) {
      const cfg = { instruments: 3, termA: true, termB: true, silent: false, bitrateMismatch: false, duplicateId: false };
      const list = h('ul', { class: 'status-list', role: 'status' });
      const count = h('output', { for: 'bench-n', class: 'count' }, '3');
      const render = () => {
        const res = diagnoseBench(cfg);
        world.setBench({ instruments: cfg.instruments, termA: cfg.termA, termB: cfg.termB, io: false, error: res.some((r) => r.level === 'bad') });
        list.replaceChildren(...res.map((r) => h('li', { class: r.level }, r.text)));
        count.textContent = cfg.instruments;
      };
      const n = h('input', { type: 'range', id: 'bench-n', min: 1, max: 3, step: 1, value: 3 });
      n.addEventListener('input', () => ((cfg.instruments = Number(n.value)), render()));
      const t = (key, label) => toggle(`bench-${key}`, label, cfg[key], (v) => ((cfg[key] = v), render()));
      el.append(
        h('label', { class: 'field', for: 'bench-n' }, h('span', {}, 'Antal instrument'), n, count),
        h('div', { class: 'toggles' }, t('termA', '120 Ω i dosans bortre ände'), t('termB', '120 Ω vid interfacet'), t('silent', 'Interfacet i tyst läge (lyssnar bara)'), t('bitrateMismatch', 'Ett instrument på 500 kbit/s, resten 250'), t('duplicateId', 'Två instrument sänder samma ID')),
        list,
      );
      render();
      return () => world.setBench({ instruments: 3, termA: true, termB: true, io: false, error: false });
    },
    after: `
      <h2>Tänk på</h2>
      <ul>
        <li><strong>Terminering:</strong> Vector-interface har normalt ingen inbyggd. Bygg in två motstånd i dosan, gärna med omkopplare. Kontrollera i manualen för er modell.</li>
        <li><strong>Jord:</strong> alla noder behöver gemensam referens. Dra med CAN-jord i kontakterna.</li>
        <li><strong>Stubbar:</strong> håll avgreningarna från stamkabeln korta, helst under en meter vid 250 kbit/s.</li>
        <li><strong>Instrument från olika bussar:</strong> de kan ha samma ID eller olika hastighet. Ge dem då var sin kanal på interfacet i stället för att slå ihop dem.</li>
      </ul>`,
  },

  // ------------------------------------------------------------------ 12
  {
    id: 'delprov-1',
    kind: 'quiz',
    title: 'Delprov 1: Koppla in en CAN-givare',
    body: `
      <p>Ni har fått en tryckgivare med CAN-utgång. Läs databladet och koppla varje pinne till rätt plint i dosan.</p>
      <table class="datasheet">
        <caption>Påhittat datablad för övningen: tryckgivare med J1939, M12 5-polig</caption>
        <tr><th>Pin</th><th>Signal</th><th>Description</th></tr>
        <tr><td>1</td><td>CAN_SHLD</td><td>Cable shield</td></tr>
        <tr><td>2</td><td>V+</td><td>Supply 9–32 V DC</td></tr>
        <tr><td>3</td><td>V−</td><td>Supply return / CAN ground</td></tr>
        <tr><td>4</td><td>CAN_H</td><td>Bus line, dominant high</td></tr>
        <tr><td>5</td><td>CAN_L</td><td>Bus line, dominant low</td></tr>
      </table>`,
    view: { group: 'bench', cam: VIEW.box, ambient: ['b1'], ambientEvery: 2 },
    mount(el, world) {
      world.setBench({ instruments: 1, io: false, termA: true, termB: true, error: false });
      const correct = { p1: ['shld'], p2: ['vplus'], p3: ['gnd'], p4: ['canh'], p5: ['canl'] };
      const names = { shld: 'Skärm', vplus: '+24 V', gnd: 'Jord', canh: 'CAN_H', canl: 'CAN_L' };
      const why = {
        p1: 'Skärmen leder bort störningar. Den jordas i en punkt, i dosan.',
        p2: 'V+ är matningen. Givaren tål 9–32 V, så lastbilens 24 V fungerar.',
        p3: 'V− är både matningens retur och bussens referens. Utan gemensam jord kan nivåerna hamna utanför vad mottagarna tål.',
        p4: 'CAN_H ska till den gula ledaren, ihop med alla andra CAN_H.',
        p5: 'CAN_L ska till den gröna ledaren, ihop med alla andra CAN_L.',
      };
      const followUp = h('div');
      const ex = wiringExercise({
        deviceTitle: 'Givarens M12-kontakt',
        boxTitle: 'Plintar i dosan',
        pins: [1, 2, 3, 4, 5].map((n) => ({ id: `p${n}`, label: `Pin ${n}` })),
        terminals: [
          { id: 'vplus', label: '+24 V', cls: 't-pwr' },
          { id: 'gnd', label: 'Jord (0 V)', cls: 't-gnd' },
          { id: 'canh', label: 'CAN_H (gul)', cls: 't-h' },
          { id: 'canl', label: 'CAN_L (grön)', cls: 't-l' },
          { id: 'shld', label: 'Skärm', cls: 't-shld' },
        ],
        accept: (pin) => correct[pin],
        feedback: (pin, to, ok) => {
          const label = `Pin ${pin.slice(1)} → ${names[to]}`;
          if (ok) return `${label}. ${why[pin]}`;
          if ((pin === 'p4' && to === 'canl') || (pin === 'p5' && to === 'canh')) return `${label}: CAN_H och CAN_L är omkastade. Inget går sönder, men noden kan varken läsa eller sända, och den stör de andra.`;
          if ((pin === 'p4' || pin === 'p5') && (to === 'vplus' || to === 'gnd')) return `${label}: en bussledare på matningen. Hela bussen låses och transceivern kan ta skada.`;
          if (pin === 'p2' && to !== 'vplus') return `${label}: givaren får ingen matning. Läs raden för pin 2 igen.`;
          return `${label}: stämmer inte med databladet. Läs raden för pin ${pin.slice(1)} igen.`;
        },
        onPass: () => {
          if (followUp.childElementCount) return;
          followUp.append(
            h('h2', {}, 'Följdfråga'),
            quiz(
              [
                {
                  q: 'Givaren sitter ensam i dosan tillsammans med interfacet. Bussen har ett 120 Ω-motstånd i dosans ena ände. Räcker det?',
                  options: [
                    { label: 'Ja, ett räcker när kabeln är kort', hint: 'Det kan råka fungera, men bussen ska ha ett motstånd i varje ände. Mät: det ska vara 60 Ω.' },
                    { label: 'Nej, det behövs ett till i andra änden, vid interfacet', right: true },
                    { label: 'Nej, varje nod ska ha ett eget motstånd', hint: 'Med ett motstånd per nod sjunker resistansen för varje nod ni lägger till. Två totalt, ett i varje ände.' },
                  ],
                  why: 'Två motstånd, ett i varje ände, ger 60 Ω. Interfacet har normalt inget inbyggt.',
                },
              ],
              'dp1',
            ),
          );
        },
      });
      el.append(ex, followUp);
      return () => (ex.cleanup(), world.setBench({ instruments: 3 }));
    },
    after: `<p class="note">Pinnordningen ovan är den vanliga för CAN på M12 (samma som CANopen och NMEA 2000 använder). Lita ändå alltid på databladet för just er enhet.</p>`,
  },

  // ------------------------------------------------------------------ 13
  {
    id: 'delprov-2',
    kind: 'quiz',
    title: 'Delprov 2: Spaken som inte pratar CAN',
    body: `
      <p>Nästa enhet är en hjälpbromsspak. Läs databladet noga innan du kopplar. Dosan har fått en I/O-modul med digitala och analoga ingångar.</p>
      <table class="datasheet">
        <caption>Påhittat datablad för övningen: rattspak för hjälpbroms, 6-polig</caption>
        <tr><th>Pin</th><th>Type</th><th>Description</th></tr>
        <tr><td>1</td><td>UB</td><td>Supply 9–32 V DC</td></tr>
        <tr><td>2</td><td>GND</td><td>Ground</td></tr>
        <tr><td>3</td><td>D</td><td>Switch output, position 1 (high side)</td></tr>
        <tr><td>4</td><td>D</td><td>Switch output, position 2 (high side)</td></tr>
        <tr><td>5</td><td>D</td><td>Switch output, position 3 (high side)</td></tr>
        <tr><td>6</td><td>A</td><td>Analog output 0.5–4.5 V, proportional to lever angle</td></tr>
      </table>`,
    view: { group: 'bench', cam: VIEW.bench, ambient: ['lev'], ambientEvery: 2.6 },
    mount(el, world) {
      world.setBench({ instruments: 0, io: true, termA: true, termB: true, error: false });
      const di = ['di1', 'di2', 'di3'];
      const correct = { p1: ['vplus'], p2: ['gnd'], p3: di, p4: di, p5: di, p6: ['ai1'] };
      const names = { vplus: '+24 V', gnd: 'Jord', canh: 'CAN_H', canl: 'CAN_L', di1: 'DI 1', di2: 'DI 2', di3: 'DI 3', ai1: 'AI 1' };
      const done = h('div');
      const ex = wiringExercise({
        deviceTitle: 'Spakens kontakt',
        boxTitle: 'Plintar i dosan',
        pins: [1, 2, 3, 4, 5, 6].map((n) => ({ id: `p${n}`, label: `Pin ${n}` })),
        terminals: [
          { id: 'vplus', label: '+24 V', cls: 't-pwr' },
          { id: 'gnd', label: 'Jord (0 V)', cls: 't-gnd' },
          { id: 'canh', label: 'CAN_H (gul)', cls: 't-h' },
          { id: 'canl', label: 'CAN_L (grön)', cls: 't-l' },
          { id: 'di1', label: 'DI 1 (digital in)', cls: 't-dig' },
          { id: 'di2', label: 'DI 2 (digital in)', cls: 't-dig' },
          { id: 'di3', label: 'DI 3 (digital in)', cls: 't-dig' },
          { id: 'ai1', label: 'AI 1 (analog in)', cls: 't-ana' },
        ],
        accept: (pin) => correct[pin],
        feedback: (pin, to, ok) => {
          const label = `Pin ${pin.slice(1)} → ${names[to]}`;
          if (to === 'canh' || to === 'canl') return `${label}: spaken har ingen CAN-utgång. En brytarutgång på bussen drar den till matningsspänning och stoppar all trafik.`;
          if (ok && di.includes(to)) return `${label}. D betyder digital: utgången är hög när spaken står i det läget, annars låg.`;
          if (ok && to === 'ai1') return `${label}. A betyder analog: spänningen följer spakens vinkel steglöst.`;
          if (ok) return `${label}. Rätt.`;
          if (di.includes(to) && pin === 'p6') return `${label}: en digital ingång ser bara hög eller låg. Den analoga utgången behöver en analog ingång för att vinkeln ska gå att läsa.`;
          if (to === 'ai1') return `${label}: det fungerar elektriskt, men den analoga ingången behövs till pin 6.`;
          return `${label}: stämmer inte med databladet.`;
        },
        onPass: () => {
          if (done.childElementCount) return;
          done.append(
            h('h2', {}, 'Så blir det CAN'),
            h('p', {}, 'I/O-modulen läser ingångarna och sänder en egen ram. Ni bestämmer själva hur den ser ut. Ett förslag som följer J1939-vanorna:'),
            h('pre', { class: 'trace' }, 'ID 18FF0080  (PGN 65280, egen data, källa 0x80)\nByte 1 bit 1–2  Läge 1   00 av, 01 på\nByte 1 bit 3–4  Läge 2\nByte 1 bit 5–6  Läge 3\nByte 2          Spakvinkel, 0,4 %/bit, offset 0'),
            h('p', { class: 'note' }, 'Skriv in samma definition i en DBC-fil. Då avkodar CANoe, CANalyzer eller ert eget program signalerna utan handräkning.'),
          );
        },
      });
      el.append(ex, done);
      return () => (ex.cleanup(), world.setBench({ instruments: 3, io: false }));
    },
    after: `<p>Fällan i den här uppgiften: ingen pinne ska till CAN_H eller CAN_L. Det syns på att databladet saknar CAN-pinnar helt. Om er riktiga hjälpbroms har CAN_H och CAN_L i pinnlistan är den en CAN-nod och kopplas som givaren i delprov 1.</p>`,
  },

  // ------------------------------------------------------------------ 14
  {
    id: 'delprov-3',
    kind: 'quiz',
    title: 'Delprov 3: Läs databladet, räkna ut värdet',
    body: `
      <p>Interfacet har loggat två ramar. Använd signaltabellen för att tolka dem.</p>
      <pre class="trace">${frameLine(0x18f00010, [0xd1, 0x4b, 0x7d, 0xff, 0xff, 0xff, 0xff, 0xff])}\n${frameLine(0x0cf00400, [0xf0, 0x7d, 0x7d, 0x40, 0x1f, 0x00, 0xf0, 0x7d])}</pre>
      <table class="datasheet">
        <caption>Signaltabell (utdrag ur J1939)</caption>
        <tr><th>Signal</th><th>PGN</th><th>Plats</th><th>Skala</th><th>Offset</th></tr>
        <tr><td>Retardermoment</td><td>61440</td><td>byte 2</td><td>1 %/bit</td><td>−125</td></tr>
        <tr><td>Bromsassistans</td><td>61440</td><td>byte 1, bit 5–6</td><td colspan="2">00 av, 01 på</td></tr>
        <tr><td>Motorvarvtal</td><td>61444</td><td>byte 4–5</td><td>0,125 r/min/bit</td><td>0</td></tr>
      </table>`,
    view: { group: 'bench', cam: VIEW.bench, ambient: ['b1', 'b2'], ambientEvery: 1.8 },
    mount(el, world) {
      world.setBench({ instruments: 2, io: false, termA: true, termB: true, error: false });
      const sanity = extractRaw([0xf0, 0x7d, 0x7d, 0x40, 0x1f], 24, 16) * 0.125; // 1000
      el.append(
        quiz(
          [
            {
              q: 'Vilken ram kommer från retardern?',
              options: [
                { label: '<code>18F00010</code>', right: true },
                { label: '<code>0CF00400</code>', hint: 'Titta på de två mittersta byten i ID:t. F004 är PGN 61444, och sista byten 00 är motorns adress.' },
              ],
              why: 'F000 i mitten är PGN 61440 (ERC1). Sista byten 10 är källadressen för retardern.',
            },
            {
              q: 'Hur stort är retardermomentet i procent?',
              answer: -50,
              unit: '%',
              hint: 'Byte 2 är 4B hex, alltså 75. Glöm inte offseten.',
              why: '0x4B = 75. 75 × 1 − 125 = −50 %. Negativt moment betyder att retardern bromsar.',
            },
            {
              q: 'Byte 1 är <code>D1</code>, binärt <code>1101 0001</code>. Vad säger bromsassistansbrytaren (bit 5–6)?',
              options: [
                { label: 'Av (00)', hint: 'Bit 1 är längst till höger. Räkna fram till bit 5 och 6.' },
                { label: 'På (01)', right: true },
                { label: 'Ej tillgänglig (11)', hint: 'Det är bit 7–8 som är 11. Bit 5–6 står precis till höger om dem.' },
              ],
              why: 'Bit 8–7 är 11, bit 6–5 är 01, bit 4–1 är 0001. Brytaren är på.',
            },
            {
              q: 'Vilket varvtal har motorn, i r/min?',
              answer: sanity,
              unit: 'r/min',
              hint: 'Byte 4 är den låga byten och byte 5 den höga. Råvärdet är 1F40 hex.',
              why: 'Byte 5 och 4 i den ordningen ger 0x1F40 = 8000. 8000 × 0,125 = 1000 r/min.',
            },
            {
              q: 'I retarderramen är byte 4 till 8 alla <code>FF</code>. Vad betyder det?',
              options: [
                { label: 'Maxvärde på fem signaler', hint: 'J1939 reserverar de högsta värdena. FF används aldrig som mätvärde.' },
                { label: 'Signalerna finns inte i den här sändaren', right: true },
                { label: 'Kommunikationsfel på bussen', hint: 'Ramen kom fram hel, annars hade den inte loggats. FE i en signal betyder fel från givaren.' },
              ],
              why: 'FF betyder ej tillgänglig. Applikationen ska hoppa över de signalerna, inte visa dem som 130 %.',
            },
          ],
          'dp3',
        ),
      );
      return () => world.setBench({ instruments: 3 });
    },
  },

  // ------------------------------------------------------------------ 15
  {
    id: 'checklista',
    title: 'Checklista för bygget',
    body: `
      <h2>Fysiskt</h2>
      <ul class="check">
        <li>Alla CAN_H ihop, alla CAN_L ihop, gemensam jord.</li>
        <li>120 Ω i varje ände. Mät 60 Ω med strömmen av.</li>
        <li>Korta stubbar från stamkabeln.</li>
        <li>Rätt matning. Lastbilar har 24 V.</li>
        <li>Enheter utan CAN går via en I/O-modul, aldrig direkt på bussen.</li>
      </ul>
      <h2>På bussen</h2>
      <ul class="check">
        <li>Samma bithastighet överallt: 250 eller 500 kbit/s.</li>
        <li>Varje ID har en enda sändare. Annars separata kanaler på interfacet.</li>
        <li>Interfacet måste kvittera om bara ett instrument sänder.</li>
        <li>Tänk på var ni kopplar in i fordonet. Bakom en gateway syns bara ett urval.</li>
      </ul>
      <h2>I applikationen</h2>
      <ul class="check">
        <li>Filtrera på PGN och källadress, inte på hela ID:t, så tål ni att prioriteten ändras.</li>
        <li>Beskriv varje signal i en DBC-fil: startbit, längd, byteordning, skala, offset, enhet.</li>
        <li>Sortera bort FE och FF innan omräkning.</li>
        <li>Digitala signaler blir lägen (uppräkningar). Analoga blir flyttal först efter skala och offset.</li>
      </ul>
      <h2>Nästa steg</h2>
      <p>Skicka databladen för de enheter ni ska koppla in, och gärna modellen på ert Vector-interface. Då kan delproven byggas om kring era riktiga pinnlistor och signaler, och frågan om D:et få ett säkert svar.</p>`,
    view: { group: 'truck', cam: VIEW.truck, rotate: true, ambient: ['eec1', 'spak', 'tco1', 'pto'], ambientEvery: 2.8 },
  },
];

export const NODE_COUNT = Object.keys(NODES).length;
