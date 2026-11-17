// Små återanvändbara UI-delar för stegen.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

const cssToken = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function segmented(label, options, value, onChange) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  const set = (v) => [...wrap.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === String(v))));
  options.forEach((o) => {
    const b = h('button', { type: 'button', 'data-value': o.value, onclick: () => (set(o.value), onChange(o.value)) }, o.label);
    wrap.append(b);
  });
  set(value);
  wrap.set = set;
  return wrap;
}

export function toggle(id, label, checked, onChange) {
  const input = h('input', { type: 'checkbox', id });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'switch', for: id }, input, h('span', { class: 'track' }), h('span', { class: 'switch-label' }, label));
}

/** Litet oscilloskop: ritar CAN_H och CAN_L från en lista med differensspänningar (0–2 V). */
export function scope(ariaLabel) {
  const canvas = h('canvas', { class: 'scope', role: 'img', 'aria-label': ariaLabel });
  const col = { h: cssToken('--can-h'), l: cssToken('--can-l'), grid: cssToken('--line'), text: cssToken('--muted') };
  const font = `11px ${cssToken('--font-mono') || 'monospace'}`;

  function draw(diffs) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 320;
    const hgt = canvas.clientHeight || 140;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    const left = 46;
    const y = (volt) => hgt - 14 - ((volt - 1.0) / 3.0) * (hgt - 28);
    ctx.font = font;
    ctx.textBaseline = 'middle';
    [1.5, 2.5, 3.5].forEach((v) => {
      ctx.strokeStyle = col.grid;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(left, y(v));
      ctx.lineTo(w, y(v));
      ctx.stroke();
      ctx.fillStyle = col.text;
      ctx.fillText(`${v.toFixed(1).replace('.', ',')} V`, 2, y(v));
    });
    ctx.setLineDash([]);
    const trace = (sign, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      diffs.forEach((d, i) => {
        const x = left + (i / (diffs.length - 1)) * (w - left - 4);
        const yy = y(2.5 + (sign * d) / 2);
        i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      });
      ctx.stroke();
    };
    trace(+1, col.h);
    trace(-1, col.l);
  }
  return { canvas, draw };
}

/**
 * Kopplingsövning: välj en pinne på enheten, välj sedan en plint i dosan.
 * accept(pinId) -> lista med godkända plintar för pinnen.
 */
export function wiringExercise({ pins, terminals, accept, feedback, deviceTitle, boxTitle, onPass }) {
  const links = new Map(); // pinId -> terminalId
  let selected = null;
  let checked = false;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'wires');
  svg.setAttribute('aria-hidden', 'true');

  const pinBtns = new Map();
  const termBtns = new Map();
  const left = h('div', { class: 'wcol' }, h('p', { class: 'wcol-title' }, deviceTitle));
  const right = h('div', { class: 'wcol' }, h('p', { class: 'wcol-title' }, boxTitle));

  pins.forEach((p) => {
    const b = h('button', { type: 'button', class: 'pin', 'aria-pressed': 'false', onclick: () => pick(p.id) }, h('b', {}, p.label), p.hint ? h('span', {}, p.hint) : null);
    pinBtns.set(p.id, b);
    left.append(b);
  });
  terminals.forEach((t) => {
    const b = h('button', { type: 'button', class: `term ${t.cls ?? ''}`, onclick: () => connect(t.id) }, t.label);
    termBtns.set(t.id, b);
    right.append(b);
  });

  const status = h('p', { class: 'wstatus', role: 'status' }, 'Välj en pinne till vänster, sedan en plint till höger.');
  const result = h('ul', { class: 'status-list' });
  const board = h('div', { class: 'wiring' }, left, h('div', { class: 'wgap' }), right, svg);
  const controls = h(
    'div',
    { class: 'row' },
    h('button', { type: 'button', class: 'btn primary', onclick: check }, 'Rätta'),
    h('button', { type: 'button', class: 'btn', onclick: reset }, 'Börja om'),
  );
  const root = h('div', { class: 'exercise' }, board, status, controls, result);

  function pick(id) {
    selected = selected === id ? null : id;
    pinBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === selected)));
    board.classList.toggle('picking', selected !== null);
    status.textContent = selected ? 'Välj nu vilken plint pinnen ska till.' : 'Välj en pinne till vänster, sedan en plint till höger.';
  }

  function connect(termId) {
    if (!selected) {
      status.textContent = 'Välj en pinne först.';
      return;
    }
    links.set(selected, termId);
    pick(selected);
    clearMarks();
    redraw();
    status.textContent = `${links.size} av ${pins.length} pinnar kopplade.`;
  }

  function clearMarks() {
    checked = false;
    result.replaceChildren();
    pinBtns.forEach((b) => b.classList.remove('right', 'wrong'));
  }

  function reset() {
    links.clear();
    selected = null;
    pick(null);
    clearMarks();
    redraw();
  }

  function check() {
    checked = true;
    result.replaceChildren();
    let correct = 0;
    pins.forEach((p) => {
      const to = links.get(p.id);
      const ok = to !== undefined && accept(p.id).includes(to);
      if (ok) correct++;
      pinBtns.get(p.id).classList.toggle('right', ok);
      pinBtns.get(p.id).classList.toggle('wrong', !ok);
      const text = to === undefined ? `${p.label}: inte kopplad än.` : feedback(p.id, to, ok);
      result.append(h('li', { class: ok ? 'ok' : 'bad' }, text));
    });
    status.textContent = correct === pins.length ? 'Alla rätt.' : `${correct} av ${pins.length} rätt. Ändra de röda och rätta igen.`;
    redraw();
    if (correct === pins.length) onPass?.();
  }

  function redraw() {
    const box = board.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.replaceChildren();
    links.forEach((termId, pinId) => {
      const a = pinBtns.get(pinId).getBoundingClientRect();
      const b = termBtns.get(termId).getBoundingClientRect();
      const x1 = a.right - box.left;
      const y1 = a.top + a.height / 2 - box.top;
      const x2 = b.left - box.left;
      const y2 = b.top + b.height / 2 - box.top;
      const mid = (x1 + x2) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`);
      const term = terminals.find((t) => t.id === termId);
      const wrong = checked && !accept(pinId).includes(termId);
      path.setAttribute('class', `wire ${wrong ? 'wrong' : term.cls ?? ''}`);
      svg.append(path);
    });
  }

  const ro = new ResizeObserver(redraw);
  ro.observe(board);
  root.cleanup = () => ro.disconnect();
  return root;
}

/**
 * Frågor med svarsalternativ eller sifferinmatning.
 * questions: [{ q, options:[{label, right}] | answer:number, tolerance, unit, why }]
 */
export function quiz(questions, idPrefix) {
  const root = h('div', { class: 'quiz' });
  let passed = 0;
  const score = h('p', { class: 'wstatus', role: 'status' }, `0 av ${questions.length} klara.`);

  questions.forEach((item, qi) => {
    const fb = h('p', { class: 'feedback', role: 'status' });
    const card = h('fieldset', { class: 'question' }, h('legend', {}, `Fråga ${qi + 1}`), h('div', { class: 'qtext', html: item.q }));
    let done = false;
    const finish = (ok, wrongHint) => {
      fb.className = `feedback ${ok ? 'ok' : 'bad'}`;
      fb.innerHTML = ok ? `Rätt. ${item.why}` : wrongHint ?? 'Inte riktigt. Försök igen.';
      if (ok && !done) {
        done = true;
        passed++;
        score.textContent = `${passed} av ${questions.length} klara.`;
      }
    };
    if (item.options) {
      const list = h('div', { class: 'options' });
      item.options.forEach((o, oi) => {
        const id = `${idPrefix}-q${qi}-o${oi}`;
        const input = h('input', { type: 'radio', name: `${idPrefix}-q${qi}`, id });
        input.addEventListener('change', () => finish(!!o.right, o.hint));
        list.append(h('label', { class: 'option', for: id }, input, h('span', { html: o.label })));
      });
      card.append(list);
    } else {
      const id = `${idPrefix}-q${qi}-in`;
      const input = h('input', { type: 'text', inputmode: 'decimal', id, class: 'num', autocomplete: 'off', 'aria-label': `Svar på fråga ${qi + 1}` });
      const go = () => {
        const v = parseFloat(input.value.replace(',', '.').replace('−', '-'));
        if (Number.isNaN(v)) {
          finish(false, 'Skriv ett tal.');
          return;
        }
        finish(Math.abs(v - item.answer) <= (item.tolerance ?? 0), item.hint);
      };
      input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
      card.append(h('div', { class: 'row' }, input, h('span', { class: 'unit' }, item.unit ?? ''), h('button', { type: 'button', class: 'btn primary', onclick: go }, 'Rätta')));
    }
    card.append(fb);
    root.append(card);
  });
  root.append(score);
  return root;
}
