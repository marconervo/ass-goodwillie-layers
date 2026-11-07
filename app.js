import { bottomDegree, lastLayer, validateInputs } from './module.js';
import { drawChart, productControls } from './chart.js';

const $ = id => document.getElementById(id);
const formControlIds = ['dimension', 'prime', 'range', 'filtration', 'compute'];

let activeWorker = null;
let layers = [];
let currentLayer = -1;

function setBusy(isBusy) {
  for (const id of formControlIds) $(id).disabled = isBusy;
  $('stop').hidden = !isBusy;
}

function setStatus(message = '', isError = false) {
  const element = $('status');
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('error', isError);
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
  return {
    n: Number($('dimension').value),
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

  const filenamePrefix = `layers-n${settings.n}-p${settings.prime}-k${k}-R${settings.range}-s${settings.filtration}`;
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
    validateInputs(settings.n, settings.prime, settings.range, settings.filtration);
    activeWorker?.terminate();
    $('layers').replaceChildren();
    setStatus();

    const finalLayer = lastLayer(settings.n, settings.prime, settings.range);
    layers = Array.from({ length: finalLayer + 1 }, (_, k) => createLayer(settings, k));
    currentLayer = -1;
    setBusy(true);
    processNextLayer();
  } catch (error) {
    setStatus(error.message, true);
  }
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
$('settings').requestSubmit();
