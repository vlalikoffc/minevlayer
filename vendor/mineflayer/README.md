# Vendored mineflayer

Unmodified copy of [PrismarineJS/mineflayer](https://github.com/PrismarineJS/mineflayer) at version **4.39.0**.

> Note: this repo previously carried local patches on top of mineflayer
> (`lib/plugins/creative.js`, `lib/plugins/resource_pack.js` and their tests).
> They were reverted — the vendored copy is now byte-for-byte upstream 4.39.0.
> If you need those fixes, send them upstream instead of patching the vendor.

Rules of this directory:

- **Do not edit code in here.** The engine evolves upstream in JS; we only re-vendor it.
- minevlayer consumes it as a regular dependency: `"mineflayer": "file:vendor/mineflayer"` (root `package.json`).
- Upstream docs, examples and tests of mineflayer live here too (`docs/`, `examples/`, `test/`).

To re-vendor a newer upstream release:

```bash
# from the repo root
rm -rf vendor/mineflayer/lib vendor/mineflayer/index.js vendor/mineflayer/index.d.ts
# copy lib/, index.js, index.d.ts from the upstream tag, bump version in vendor/mineflayer/package.json
npm install
npm test
```

To run mineflayer's own test suite (needs Java + downloads Minecraft server jars):

```bash
cd vendor/mineflayer
npm install
npm run mocha_test
```
