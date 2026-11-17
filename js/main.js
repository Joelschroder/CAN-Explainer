import { STEPS } from './steps.js';
import { BUSES } from './data.js';
import { h } from './ui.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const content = $('content');

let world;
try {
  const scene = await import('./scene.js');
  try {
    world = scene.createWorld(stage);
  } catch (err) {
    console.warn('3D-vyn kunde inte startas:', err);
    world = scene.createNullWorld();
  }
} catch (err) {
  console.warn('3D-biblioteket kunde inte laddas:', err);
  const noop = () => {};
  world = { ok: false, setView: noop, patchView: noop, send: noop, setWire: noop, setBench: noop, spaghettiStats: { nodes: 10, wires: 45 } };
}
if (!world.ok) {
  $('fallback').hidden = false;
  stage.classList.add('no3d');
}

// Teckenförklaring för bussarna
const legends = {
  truck: Object.values(BUSES).filter((b) => b.group === 'truck').map((b) => [b.token, b.name]),
  wire: [['--can-h', 'CAN_H'], ['--can-l', 'CAN_L']],
  bench: [['--can-h', 'CAN_H'], ['--can-l', 'CAN_L'], ['--muted', 'USB och vanliga ledningar']],
};

// Tidslinje
const timeline = $('timeline');
STEPS.forEach((s, i) => {
  timeline.append(
    h('button', { type: 'button', class: s.kind === 'quiz' ? 'tick test' : 'tick', title: s.title, 'aria-label': `${i + 1}. ${s.title}`, onclick: () => go(i) }, String(i + 1)),
  );
});

let index = -1;
let cleanup = null;

function go(n, { focus = true } = {}) {
  n = Math.max(0, Math.min(STEPS.length - 1, n));
  if (n === index) return;
  cleanup?.();
  cleanup = null;
  index = n;
  const step = STEPS[n];

  $('eyebrow').textContent = step.kind === 'quiz' ? `Delprov · ${n + 1} av ${STEPS.length}` : `Kapitel ${n + 1} av ${STEPS.length}`;
  $('title').textContent = step.title;
  world.setView(step.view);

  const widget = h('div', { class: 'widget' });
  content.replaceChildren(h('div', { class: 'prose', html: step.body }));
  if (step.mount) {
    content.append(widget);
    cleanup = step.mount(widget, world) ?? null;
  }
  if (step.after) content.append(h('div', { class: 'prose', html: step.after }));
  content.scrollTop = 0;

  $('legend').replaceChildren(...legends[step.view.group].map(([token, name]) => h('li', { style: `--c:var(${token})` }, name)));
  [...timeline.children].forEach((b, i) => {
    b.classList.toggle('done', i < n);
    if (i === n) {
      b.setAttribute('aria-current', 'step');
      timeline.scrollTo({ left: b.offsetLeft - timeline.clientWidth / 2 + b.offsetWidth / 2 });
    } else b.removeAttribute('aria-current');
  });
  $('prev').disabled = n === 0;
  $('next').disabled = n === STEPS.length - 1;
  $('next').textContent = n === 0 ? 'Börja' : 'Nästa';
  try {
    history.replaceState(null, '', `#${step.id}`);
  } catch {
    /* inbäddad vy utan historik */
  }
  if (focus) $('title').focus({ preventScroll: true });
}

$('prev').addEventListener('click', () => go(index - 1));
$('next').addEventListener('click', () => go(index + 1));
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.key === 'ArrowRight') go(index + 1);
  if (e.key === 'ArrowLeft') go(index - 1);
});

const fromHash = () => Math.max(0, STEPS.findIndex((s) => `#${s.id}` === location.hash));
window.addEventListener('hashchange', () => go(fromHash()));
go(fromHash(), { focus: false });
