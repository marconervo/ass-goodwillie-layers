const PRODUCT_COLORS = {
  h_0: '#64748b',
  h_1: '#177f73',
  h_2: '#b57524',
  a_0: '#64748b'
};

const PRODUCTS_BY_PRIME = {
  2: ['h_0', 'h_1', 'h_2'],
  odd: ['a_0', 'h_0']
};

function productLabel(name) {
  return name.replace('_0', '₀').replace('_1', '₁').replace('_2', '₂');
}

export function productControls(prime, redraw) {
  const legend = document.createElement('div');
  legend.className = 'legend';
  const names = prime === 2 ? PRODUCTS_BY_PRIME[2] : PRODUCTS_BY_PRIME.odd;

  for (const name of names) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.dataset.product = name;
    input.addEventListener('change', redraw);

    const text = document.createElement('span');
    text.textContent = productLabel(name);
    text.style.color = PRODUCT_COLORS[name];

    label.append(input, text);
    legend.append(label);
  }
  return legend;
}

export function drawChart(container, result, legend) {
  const { n, m, prime, k, range, filtration, bottom, classes, products } = result;
  // Negative-connectivity layers need a negative left endpoint. The resolver
  // still works in shifted stem coordinates; only the chart uses actual q=t-s.
  const rangeStart = Math.min(0, bottom);
  const rangeSpan = range - rangeStart;
  const width = Math.max(container.clientWidth - 2, 90 + rangeSpan * 30);
  const height = 85 + filtration * 25;
  const dx = (width - 90) / Math.max(1, rangeSpan);
  const x = q => 55 + (q - rangeStart) * dx;
  const y = s => height - 45 - s * 25;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const attributes = {
    xmlns: svg.namespaceURI,
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': m === null
      ? 'Adams E2 for layer ' + prime + '^' + k + ' of S^' + n + ', homotopy degree ' + rangeStart + ' to ' + range + ', filtration 0 to ' + filtration
      : 'Adams E2 for the fiber of the layer map ' + prime + '^' + k + ' from S^' + n + ' to Sigma^(' + (n - m) + ')S^' + m + ', homotopy degree ' + rangeStart + ' to ' + range + ', filtration 0 to ' + filtration
  };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);

  const add = (tag, properties, text) => {
    const node = document.createElementNS(svg.namespaceURI, tag);
    for (const [key, value] of Object.entries(properties)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    svg.append(node);
    return node;
  };

  add('rect', { width, height, fill: 'white' });
  const axisText = { 'font-family': 'system-ui,sans-serif', 'font-size': 11, fill: '#5d6d64' };

  for (let q = rangeStart; q <= range; q++) {
    add('line', { x1: x(q), x2: x(q), y1: 25, y2: y(0), stroke: '#e9eee8' });
    add('text', { ...axisText, x: x(q), y: y(0) + 19, 'text-anchor': 'middle' }, q);
  }
  for (let s = 0; s <= filtration; s++) {
    add('line', { x1: 55, x2: width - 35, y1: y(s), y2: y(s), stroke: '#e9eee8' });
    add('text', { ...axisText, x: 39, y: y(s) + 4, 'text-anchor': 'end' }, s);
  }

  const positions = new Map();
  const visible = classes.filter(c => c.q >= rangeStart && c.q <= range && c.s <= filtration);
  for (const entry of visible) {
    for (let index = 0; index < entry.dimension; index++) {
      const offset = (index - (entry.dimension - 1) / 2) * Math.min(7, 20 / entry.dimension);
      positions.set(`${entry.stem},${entry.s},${index}`, [x(entry.q) + offset, y(entry.s) - offset]);
    }
  }

  const enabled = new Set([...legend.querySelectorAll('input:checked')].map(el => el.dataset.product));
  for (const p of products) {
    if (!enabled.has(p.name)) continue;
    const [stem, s] = p.source, [dn, ds] = p.shift;
    p.matrix.forEach((row, sourceIndex) => row.forEach((coefficient, targetIndex) => {
      const from = positions.get(`${stem},${s},${sourceIndex}`);
      const to = positions.get(`${stem + dn},${s + ds},${targetIndex}`);
      if (coefficient && from && to) {
        add('line', {
          x1: from[0], y1: from[1], x2: to[0], y2: to[1],
          stroke: k === 0 && stem === 0 && dn === 0 ? '#000' : PRODUCT_COLORS[p.name],
          'stroke-width': 1.3
        });
      }
    }));
  }

  for (const entry of visible) {
    for (let index = 0; index < entry.dimension; index++) {
      const [cx, cy] = positions.get(`${entry.stem},${entry.s},${index}`);
      add('circle', { cx, cy, r: 3.3, fill: k === 0 && entry.q === bottom ? '#000' : '#203c33' });
    }
  }
  container.replaceChildren(svg);
}
