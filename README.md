# AI Stock Research Website

Polished Next.js stock research app with:
- DCF valuation engine
- Official Morningstar **star rating** integration point
- Internal AI-style quality/value/moat metrics from public data + adaptive DCF assumptions
- AI natural-language screener (**Ollama only**, with heuristic fallback)
- Finnhub market + fundamentals data

## 1) Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env file:
   ```bash
   cp .env.example .env.local
   ```
3. Fill in:
   - `FINNHUB_API_KEY` (required)

## 2) Run local AI with Ollama (no API cost)

1. Install Ollama (https://ollama.com/download)
2. Pull a model:
   ```bash
   ollama pull llama3.1:8b
   ```
3. Start Ollama (if not auto-running):
   ```bash
   ollama serve
   ```

The app calls Ollama at `OLLAMA_BASE_URL` (default `http://localhost:11434`) and uses `OLLAMA_MODEL`.

## 3) Morningstar official stars

This app reads star ratings from:
- `data/morningstar-stars.csv`

CSV format:
```csv
symbol,stars,source,asOf
AAPL,4,Official Morningstar Feed,2026-02-20
```

Use your licensed Morningstar export/API pipeline to refresh this CSV. The UI/API will surface these as official star ratings.

## 4) Run app

```bash
npm run dev
```

Open http://localhost:3000

## 5) AI Search examples

- "find me stocks on discounts in the industrials sector"
- "value stocks with 4+ morningstar stars and quality balance sheets"
- "cheap healthcare names with PE below 20"

## Notes

- Provider order: **ollama → heuristic**
- API keys are server-side only.
- DCF is an analytical estimate, not investment advice.
