# Connectome custom codicon sources

Monochrome filled SVGs that become glyphs in the Connectome icon font
(`connectome-codicon.ttf`). The activity rail only reliably shows **codicon
font** icons — not CSS `mask-image` / background SVGs (see agent shared-memory).

## Pipeline

Same idea as [microsoft/vscode-codicons](https://github.com/microsoft/vscode-codicons):

1. Add or edit an SVG here (`<name>.svg`, single filled path preferred).
2. Register `<name>` (and optional aliases) with a Private Use Area codepoint
   (`0xF000+`) in `scripts/build-connectome-codicons.js` → `CODEPOINTS`.
3. From the repo root:

   ```
   yarn build:codicons
   ```

4. Use it in TypeScript like any other rail icon:

   ```ts
   import { codicon } from '@theia/core/lib/browser/widgets';
   title.iconClass = codicon('claude'); // "codicon codicon-claude"
   ```

5. Rebuild extensions + desktop:

   ```
   yarn build:extensions
   yarn desktop:build:dev
   ```

## SVG tips

- Square `viewBox` (e.g. `0 0 24 24` or `0 0 50 50`).
- Solid fills only (`fill="#000"`); no strokes if you can avoid them.
- If the glyph looks broken after build, re-export / sanitize the SVG
  (vscode-codicons recommends tools like svg-reorient for Figma exports).

## Current glyphs

| Class | Alias | Source | Codepoint | Meaning |
|-------|-------|--------|-----------|---------|
| `codicon-claude` | `codicon-anthropic` | `claude.svg` | `U+F000` | Claude Code / Anthropic starburst |
| `codicon-antigravity` | `codicon-agy` | `antigravity.svg` | `U+F001` | Antigravity agent mark |

### Stock vs custom

`@vscode/codicons` (what Theia ships) already includes some brand glyphs such as `openai` and, as of 0.0.45, `claude` (`\ec82`). Prefer stock when the glyph is good enough:

```ts
codicon('openai')       // stock - Codex
codicon('claude')       // Connectome override (our CSS wins)
codicon('antigravity')  // Connectome-only (not in stock)
```

Use this pipeline when you need a glyph that is **not** in stock, or you want a Connectome-specific drawing.

### Source art notes

- Prefer monochrome **path** SVGs (`fill="#000"`).
- Some vendor `.svg` files (e.g. Affinity/Serif exports) are **not vector** — they wrap a PNG via `<image xlink:href="data:image/png;base64,…">`. Those still work as the *source of truth*: run

  ```
  node scripts/svg-embedded-png-to-path.js path/to/vendor.svg connectome-extensions/product/src/browser/icons/codicons-src/<name>.svg
  yarn build:codicons
  ```

  which extracts the embedded PNG from the SVG you provided and traces a path glyph. Keep the original as `<name>.source.svg` if you want the raw file in-repo (ignored by the font builder).
