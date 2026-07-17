# CatchSnap AI / LegalBite Greece

Snap, identify Greek marine species, check legal status & nutrition, find fishing spots by category.

## Quick start

```bash
# Terminal 1 — backend
cd ../catchsnap-backend
npm install
cp .env.example .env   # set XAI_API_KEY for real photo ID
npm run dev

# Terminal 2 — frontend
cd catchsnap-frontend
npx serve .
# or open index.html via any static server
```

Open the frontend URL — backend must run on port **3001** (default `window.CATCHSNAP_API`).

For production, set before `js/app.js`:

```html
<script>
  window.CATCHSNAP_API = 'https://YOUR-API.vercel.app/api/v1';
</script>
```

## Features

| Tab | What it does |
|-----|----------------|
| **CatchSnap** | Example catches + **real photo upload** → vision ID, Greek catalog match, nutrition & key benefits, legal status |
| **Map** | Verified legal spots + **OSM discover** by category (pier, harbour, marina, rocky, beach); Near Me; marine conditions on spot details |
| **Journal** | LocalStorage catch log |
| **Legal** | Greece reporting guidance → official HCG portal |

## API (backend)

| Endpoint | Data |
|----------|------|
| `GET /api/v1/map/legal` | Verified Greek fishing spots (+ category) |
| `GET /api/v1/places?lat=&lng=&category=` | Verified + OpenStreetMap POIs |
| `POST /api/v1/analyze` | Species ID (example or photo) + legal + benefits |
| `GET /api/v1/species` | Expanded Greek marine catalog |
| `GET /api/v1/marine?lat=&lng=` | Open-Meteo wave/sea temp |

Photo uploads are resized client-side (max edge 1280px) before POST.

## Deploy

- **Frontend**: Vercel / Netlify / GitHub Pages — static files
- **Backend**: Vercel or Render — set `XAI_API_KEY` and `CORS_ORIGIN`
