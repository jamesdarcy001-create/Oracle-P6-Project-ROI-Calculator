# Field Ops — ROI Analysis Engine

A construction-sector ROI calculator: guided input walkthrough → animated reveal → interactive explorer dashboard with scenario comparison.

## Stack

- React 19 + Vite
- Plain CSS (no framework) — terminal/HUD aesthetic

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Outputs a static site to `dist/`.

## Structure

- `src/App.jsx` — all app logic and components (boot sequence, guided input, reveal, explorer)
- `src/index.css` — all styling
- `src/main.jsx` — mount point
