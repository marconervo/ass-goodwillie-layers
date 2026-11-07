# Upstream engine and local adapter

Source: https://github.com/SpectralSequences/sseq

Pinned source commit: `b28ec47803ea888a0912f40465410b4ffa238f60`.

Authors include Hood Chatham, Dexter Chua and other contributors as credited
upstream. The source repository is distributed
under MIT or Apache-2.0; both upstream license files are included here.

This is a modified build, made 2026-11-02. `engine/adapter.patch` records all
local Rust changes: an optional `max_filtration` argument to Resolve, and
optional degreewise validation against `expected_dimensions` in the module JSON.
The Steenrod algebra, module, resolution and product algorithms are unchanged.

Build: Rust 1.99.1, wasm-bindgen / wasm-bindgen-cli 0.2.130,
wasm32-unknown-unknown, release, CARGO_PROFILE_RELEASE_DEBUG=0, stable panic=abort.
Dependencies are pinned in `engine/Cargo.lock`; rebuild instructions are in
`scripts/rebuild-engine.sh`. No wasm-opt transformation was applied.

SHA-256 of the exact vendored files:

```
0400a2e159a4bb8c0964231d4ae6b1262bb848ff20e8e971f397860d6cf9c887  sseq_gui_wasm.js
42fcafa53d7aeb0baa37f62335bd141657bac325383ad53334a9c6428d2f8069  sseq_gui_wasm_bg.wasm
```

Earlier versions used the official web deployment binaries directly. Those
files have been replaced by this pinned, patched build so that the filtration
bound limits computation rather than merely cropping the plot.

## Mathematical typesetting

KaTeX 0.16.22 (MIT license), from the official npm package `katex@0.16.22`.
Its renderer, auto-render extension, stylesheet, fonts, and license are vendored
in `katex/`. See `katex/LICENSE`. No CDN is required.

- `katex.min.js`: `e8d885505949f3a5f4abdd5dd0d53696bd1371ad26ffbf4f310dcd77c8cdae89`
- `auto-render.min.js`: `bb53eb953394531aae36fdd537065c4244eb8542901a3ce914601d932675b8ac`
- `katex.min.css`: `19095127357ed6d29fe0a63a6b000c913a89f7f1963b765dd3715e97c9852e75`
