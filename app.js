import { bottomDegree, lastLayer, validateInputs } from './module.js';
import { drawChart, productControls } from './chart.js';

const $ = id => document.getElementById(id);
const formControlIds = ['dimension', 'target-dimension', 'lock-difference', 'prime', 'range', 'filtration', 'compute'];

let activeWorker = null;
let layers = [];
let currentLayer = -1;
let busy = false;
let lockedDifference = null;

function setBusy(isBusy) {
  busy = isBusy;
  for (const id of formControlIds) $(id).disabled = isBusy;
  syncDimensionLockControls();
  $('stop').hidden = !isBusy;
}

function syncDimensionLockControls() {
  const target = $('target-dimension');
  const lock = $('lock-difference');
  const locked = lockedDifference !== null;
  const sourceValue = Number($('dimension').value);
  const targetValue = Number(target.value);
  const canLock = Number.isSafeInteger(sourceValue)
    && Number.isSafeInteger(targetValue)
    && targetValue > sourceValue;
  target.disabled = busy || locked;
  lock.disabled = busy || (!locked && !canLock);
  lock.setAttribute('aria-pressed', String(locked));
  lock.textContent = locked ? '🔓' : '🔒';
  lock.setAttribute('aria-label', locked ? 'Unlock the difference m−n' : 'Lock the difference m−n');
}

function setStatus(message = '', isError = false) {
  const element = $('status');
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('error', isError);
}

function setCalculationDescription(settings) {
  const description = $('calculation-description');
  const sourceSphere = `S^${settings.n}`;
  description.textContent = settings.m === null
    ? `These are the Goodwillie layers of \\(${sourceSphere}\\) at the prime ${settings.prime}.`
    : `These are the Goodwillie layers of the suspension map \\(${sourceSphere} \\to ${settings.m - settings.n === 1 ? '\\Omega ' : `\\Omega^{${settings.m - settings.n}}`}S^${settings.m}\\) at the prime ${settings.prime}.`;
  renderMathInElement(description, {
    delimiters: [{ left: '\\(', right: '\\)', display: false }],
    throwOnError: true
  });
}

function downloadFile(filename, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getSettings() {
  const targetValue = $('target-dimension').value.trim();
  return {
    n: Number($('dimension').value),
    m: targetValue === '' ? null : Number(targetValue),
    prime: Number($('prime').value),
    range: Number($('range').value),
    filtration: Number($('filtration').value)
  };
}

function createResult(settings, k) {
  return {
    format: 1,
    page: 2,
    ...settings,
    k,
    bottom: bottomDegree(settings.n, settings.prime, k),
    complete: false,
    description: 'Ext of the spectral model of D_(p^k)I(S^n); q=t-s. Differentials and hidden extensions are not computed.',
    engine: 'ext-rs; see vendor/NOTICE.md',
    module: null,
    classes: [],
    products: []
  };
}

function createDownloadButton(kind, filename, getContents) {
  const button = document.createElement('button');
  button.className = 'secondary';
  button.textContent = `Download ${kind}`;
  button.disabled = true;
  button.addEventListener('click', () => downloadFile(filename, ...getContents()));
  return button;
}

function createLayer(settings, k) {
  const result = createResult(settings, k);
  const section = document.createElement('section');
  section.className = 'panel output';

  const title = document.createElement('h2');
  title.className = 'layer-title';
  title.textContent = `k = ${k}`;

  const chart = document.createElement('div');
  chart.className = 'chart';

  const message = document.createElement('p');
  message.className = 'empty';
  message.textContent = 'Waiting…';
  chart.append(message);

  const redraw = () => {
    if (result.complete) drawChart(chart, result, legend);
  };
  const legend = productControls(settings.prime, redraw);

  const targetSuffix = settings.m === null ? '' : `-m${settings.m}`;
  const filenamePrefix = `layers-n${settings.n}${targetSuffix}-p${settings.prime}-k${k}-R${settings.range}-s${settings.filtration}`;
  const downloads = document.createElement('div');
  downloads.className = 'downloads';
  const buttons = [
    createDownloadButton('module', `${filenamePrefix}-module.json`, () => [JSON.stringify(result.module, null, 2), 'application/json']),
    createDownloadButton('data', `${filenamePrefix}-data.json`, () => [JSON.stringify(result, null, 2), 'application/json']),
    createDownloadButton('SVG', `${filenamePrefix}.svg`, () => [new XMLSerializer().serializeToString(chart.firstChild), 'image/svg+xml'])
  ];
  downloads.append(...buttons);

  section.append(title, legend, chart, downloads);
  $('layers').append(section);
  return { result, chart, message, buttons, redraw };
}

function finishLayer(layer) {
  layer.result.complete = true;
  for (const button of layer.buttons) button.disabled = false;
  layer.redraw();
  processNextLayer();
}

function failLayer(layer, reason) {
  activeWorker?.terminate();
  activeWorker = null;
  layer.message.textContent = `Calculation failed: ${reason}`;
  processNextLayer();
}

function handleWorkerMessage(layer, { data }) {
  const { result, buttons } = layer;
  if (data.error) {
    failLayer(layer, data.error);
    return;
  }
  if (data.input) {
    Object.assign(result, data.input);
    buttons[0].disabled = false;
  }
  if (data.AddClass?.num) {
    const { b: { coords: [stem, filtration] }, num } = data.AddClass;
    result.classes.push({
      stem,
      q: stem + result.bottom,
      s: filtration,
      t: stem + result.bottom + filtration,
      dimension: num
    });
  }
  if (data.AddProduct?.product.some(row => row.some(Boolean))) {
    const { source_b, mult_b, name, product } = data.AddProduct;
    result.products.push({ source: source_b.coords, shift: mult_b.coords, name, matrix: product });
  }
  if (data.done) finishLayer(layer);
}

function processNextLayer() {
  activeWorker?.terminate();
  activeWorker = null;
  currentLayer++;

  if (currentLayer === layers.length) {
    setBusy(false);
    setStatus();
    return;
  }

  const layer = layers[currentLayer];
  layer.message.textContent = 'Computing the minimal resolution…';
  activeWorker = new Worker('./worker.js');
  activeWorker.onerror = event => {
    event.preventDefault();
    failLayer(layer, event.message || 'Could not load the computation worker.');
  };
  activeWorker.onmessage = event => handleWorkerMessage(layer, event);
  activeWorker.postMessage(layer.result);
}

$('settings').addEventListener('submit', event => {
  event.preventDefault();
  const settings = getSettings();

  try {
    validateInputs(settings.n, settings.prime, settings.range, settings.filtration, settings.m);
    activeWorker?.terminate();
    $('layers').replaceChildren();
    setCalculationDescription(settings);
    setStatus();

    const finalLayer = lastLayer(settings.n, settings.prime, settings.range);
    const firstLayer = settings.m === null ? 0 : 1;
    layers = Array.from(
      { length: Math.max(0, finalLayer - firstLayer + 1) },
      (_, index) => createLayer(settings, index + firstLayer)
    );
    currentLayer = -1;
    setBusy(true);
    processNextLayer();
  } catch (error) {
    setStatus(error.message, true);
  }
});

$('lock-difference').addEventListener('click', () => {
  if (lockedDifference === null) {
    const source = Number($('dimension').value);
    const target = Number($('target-dimension').value);
    if (!Number.isSafeInteger(source) || !Number.isSafeInteger(target)) return;
    lockedDifference = target - source;
  } else {
    lockedDifference = null;
  }
  syncDimensionLockControls();
});

$('target-dimension').addEventListener('input', syncDimensionLockControls);
$('dimension').addEventListener('input', () => {
  if (lockedDifference !== null) {
    const source = Number($('dimension').value);
    if (Number.isSafeInteger(source)) $('target-dimension').value = String(source + lockedDifference);
  }
  syncDimensionLockControls();
});

$('stop').addEventListener('click', () => {
  activeWorker?.terminate();
  activeWorker = null;
  setBusy(false);
  for (const layer of layers) {
    if (!layer.result.complete) layer.message.textContent = 'Stopped. Compute again to restart.';
  }
  setStatus('Stopped. Completed layers remain available.');
});

window.addEventListener('resize', () => layers.forEach(layer => layer.redraw()));
syncDimensionLockControls();
$('settings').requestSubmit();
