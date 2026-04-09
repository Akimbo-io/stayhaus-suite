# StayHaus Composer (Figma plugin)

Phase 2a foundation. Picks a brand, picks Welcome flow + sections, clones brand-styled section components from the StayHaus Master Templates Figma file into the active file.

## Setup

```bash
cd composer
npm install
npm run build
```

## Load in Figma

1. Open Figma desktop app (web doesn't allow local plugins)
2. Menu: Plugins → Development → Import plugin from manifest
3. Choose `composer/manifest.json`
4. Open any Figma file. Plugins → Development → StayHaus Composer

## Prerequisites

- The "StayHaus Master Templates" Figma file must be shared as a Team Library, and at least one instance of each needed component must already be present in the current Figma file (so the plugin can resolve them by name). This limitation goes away in Phase 2b.
- Components must be named `<flow>/<section>/<variant>`, e.g. `welcome/hero/v2`.
- `https://stayhaus.eu/brands.json` must be reachable.

## Develop

```bash
npm run watch   # rebuild on save
```

After each change, in Figma: Plugins → Development → StayHaus Composer → close and reopen the plugin window (Figma reloads `dist/`).
