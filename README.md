# Field Ops — ROI Analysis Engine

A construction-sector ROI calculator: landing (quick / guided / resume) → optional animated reveal → interactive explorer with scenarios, assumptions, and share links.

## Stack

- React 19 + Vite
- Vitest for model tests (`src/model/`)
- Plain CSS (no framework) — terminal/HUD aesthetic

## Development

```bash
npm install
npm run dev
npm test
```

## Build

```bash
npm run build
```

Outputs a static site to `dist/`.

## Structure

- `src/model/` — ROI calc engine, persistence, share encoding, assumptions copy
- `src/components/` — Landing, QuickEstimate, AssumptionsPanel
- `src/App.jsx` — boot sequence, guided input, reveal, explorer UI
- `src/index.css` — styling
- `src/main.jsx` — mount point

## Session & sharing

- Workspace auto-saves to `localStorage` (`fo-session-v1`)
- **LINK** in the explorer header copies a URL with encoded inputs and scenarios
- Optional “Skip this screen next time” on the landing page (`fo-skip-landing`)
