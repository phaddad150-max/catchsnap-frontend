# CatchSnap AI / LegalBite Greece

Beta v1.4 prototype — Snap, analyze, log legally, find fishing spots in Greece.

## Quick start (no build)

```bash
# Terminal 1 — backend
cd ../catchsnap-backend
npm install && npm run dev

# Terminal 2 — open frontend
cd catchsnap-frontend
# Double-click index.html, or:
npx serve .
```

Open `http://localhost:3000` (or file path) — backend must run on port **3001**.

## Features

| Tab | What it does |
|-----|----------------|
| **CatchSnap** | Example catches + photo upload → species ID, nutrition, legal status |
| **Map** | 10 legal spots + 3 protected areas, search, Near Me filter |
| **Journal** | LocalStorage catch log |
| **Legal** | Greece 2026 reporting guidance → official HCG portal |

## Project structure

```
catchsnap-frontend/
  index.html      ← Your v1.4 prototype (GitHub-ready)
  css/styles.css
  js/app.js       ← Loads real data from backend API
```

## API (free, no keys)

| Endpoint | Data |
|----------|------|
| `GET /api/v1/map/legal` | 10 Greek fishing spots |
| `GET /api/v1/map/protected` | Natura/marine protected areas |
| `POST /api/v1/analyze` | Species ID + legal verdict |
| `GET /api/v1/marine?lat=&lng=` | Open-Meteo wave/sea temp |

## Deploy

- **Frontend**: GitHub Pages, Vercel, or Netlify — static files only
- **Backend**: Render free tier (`render.yaml` included)
- Set `window.CATCHSNAP_API = 'https://your-api.onrender.com/api/v1'` before `app.js` in production