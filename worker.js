// Each layer gets its own worker so a long resolution cannot block the UI or
// prevent the Stop button from terminating the current computation.
importScripts('./vendor/sseq_gui_wasm.js');

self.onmessage = async ({ data }) => {
  try {
    const { n, prime, k, range, filtration } = data;
    const { bottomDegree, layerModule } = await import('./module.js');
    const bottom = bottomDegree(n, prime, k);
    const stem = range - bottom;
    const cutoff = Math.max(0, stem + filtration + 1);
    const input = layerModule(n, prime, k, cutoff);
    self.postMessage({ input: { ...input, cutoff } });

    // If the layer starts above the requested range, its module is still useful
    // for download, but no Ext resolution is necessary.
    if (stem < 0) { self.postMessage({ done: true }); return; }

    await wasm_bindgen({ module_or_path: './vendor/sseq_gui_wasm_bg.wasm' });
    let failed = false;
    const resolution = wasm_bindgen.Resolution.new(raw => {
      const { sseq, action } = JSON.parse(raw);
      if (action.Error) {
        failed = true;
        self.postMessage({ error: action.Error.message });
      } else if (sseq === 'Main') {
        self.postMessage(action);
      }
    });
    const run = action => resolution.run(JSON.stringify({
      recipients: ['Resolver'],
      sseq: 'Main',
      action
    }));

    run({
      ConstructJson: {
        algebra_name: 'adem',
        data: JSON.stringify(input.module)
      }
    });
    if (!failed) {
      run({ Resolve: { max_degree: stem, max_filtration: filtration } });
    }
    resolution.free();
    if (!failed) self.postMessage({ done: true });
  } catch (error) {
    self.postMessage({ error: error.message || String(error) });
  }
};
