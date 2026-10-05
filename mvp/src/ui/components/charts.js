// Gráficos leves em HTML/SVG, sem bibliotecas externas.
// Cada gráfico tem tooltip no hover e cores por papel (CSS vars em app.css).
import { esc } from '../format.js';

let tip;
function tooltip() {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    document.body.appendChild(tip);
  }
  return tip;
}
export function bindTooltips(root) {
  root.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const t = tooltip();
      t.innerHTML = el.dataset.tip;
      t.style.opacity = 1;
      const x = Math.min(e.clientX + 14, window.innerWidth - t.offsetWidth - 8);
      t.style.left = `${x}px`;
      t.style.top = `${e.clientY - t.offsetHeight - 10}px`;
      el.closest('g[data-group]')?.parentElement?.querySelectorAll('g[data-group]').forEach((g) => g.classList.toggle('is-dim', g !== el.closest('g[data-group]')));
    });
    el.addEventListener('mouseleave', () => {
      tooltip().style.opacity = 0;
      el.closest('svg')?.querySelectorAll('g.is-dim').forEach((g) => g.classList.remove('is-dim'));
    });
  });
}

/** Barras horizontais: [{label, value, sub?, color?}] */
export function hBars(items, { format = (v) => v, max } = {}) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return `<div class="hbars">${items
    .map(
      (i) => `<div class="hbar" data-tip="<b>${esc(i.label)}</b><br>${esc(format(i.value))}${i.sub ? ` · ${esc(i.sub)}` : ''}">
        <span class="hbar__label" title="${esc(i.label)}">${esc(i.label)}</span>
        <div class="hbar__track"><div class="hbar__fill" style="width:${(i.value / m) * 100}%;${i.color ? `background:${i.color}` : ''}"></div></div>
        <span class="hbar__value">${esc(format(i.value))}</span>
      </div>`
    )
    .join('')}</div>`;
}

/** Colunas verticais (série única): [{label, value, tip}] */
export function columns(items, { height = 200 } = {}) {
  const W = 640;
  const H = height;
  const pad = { l: 28, r: 6, t: 12, b: 24 };
  const max = Math.max(1, ...items.map((i) => i.value));
  const niceMax = Math.ceil(max / 2) * 2 || 2;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const step = iw / items.length;
  const bw = Math.max(4, Math.min(28, step - 6));
  const ticks = [0, niceMax / 2, niceMax];
  const y = (v) => pad.t + ih - (v / niceMax) * ih;

  const grid = ticks
    .map((t) => `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`)
    .join('');
  const bars = items
    .map((it, i) => {
      const cx = pad.l + step * i + step / 2;
      const h = Math.max(it.value ? 2 : 0, (it.value / niceMax) * ih);
      const y0 = pad.t + ih;
      const r = Math.min(4, bw / 2, h);
      // topo arredondado (4px), base reta no eixo
      const path = h
        ? `M${cx - bw / 2},${y0} V${y0 - h + r} Q${cx - bw / 2},${y0 - h} ${cx - bw / 2 + r},${y0 - h} H${cx + bw / 2 - r} Q${cx + bw / 2},${y0 - h} ${cx + bw / 2},${y0 - h + r} V${y0} Z`
        : '';
      const showLabel = items.length <= 14 || i % 2 === 0;
      return `<g data-group>
        <path class="col-bar" d="${path}" fill="var(--series-1)"/>
        <rect class="hit" data-tip="${esc(it.tip || `${it.label}: ${it.value}`)}" x="${cx - step / 2}" y="${pad.t}" width="${step}" height="${ih}"/>
        ${showLabel ? `<text x="${cx}" y="${H - 6}" text-anchor="middle">${esc(it.label)}</text>` : ''}
      </g>`;
    })
    .join('');
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de colunas">${grid}<line class="axis-line" x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}"/>${bars}</svg>`;
}

/** Barra empilhada 100% + lista-legenda: [{label, value, color}] */
export function stackedShare(items) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return `
    <div class="stack">${items
      .filter((i) => i.value)
      .map((i) => `<div style="flex:${i.value};background:${i.color}" data-tip="<b>${esc(i.label)}</b><br>${i.value} leads · ${Math.round((i.value / total) * 100)}%"></div>`)
      .join('')}</div>
    <ul class="stack-list">${items
      .map((i) => `<li><i style="background:${i.color}"></i>${esc(i.label)}<b>${i.value}</b><small>${Math.round((i.value / total) * 100)}%</small></li>`)
      .join('')}</ul>`;
}
