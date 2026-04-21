# GEM / Video Analyzer

Upfrog internal team tool for media buying. Analyzes video creatives with the **GEM (Generative Evaluation Method)** framework using Gemini 2.5 Pro, then generates **white-label ad copy for each client brand** using OpenAI.

## What it does

1. **Analyze once** — upload a video (YouTube URL or MP4/MOV up to 20MB) and get a structured 26-column GEM row ready to paste into Sheets
2. **Fork copy infinitely** — generate Meta ad copy for any of your white-label clients. Each generation is personalized with the client's business name, location, vertical, and tone of voice
3. **Switch between past generations** — view every copy variation ever generated for this video, across all clients and models

## Stack

| Layer           | What                                       |
| --------------- | ------------------------------------------ |
| Frontend        | React 18 + Vite                            |
| Backend         | Netlify Functions (Node 18)                |
| Auth            | Netlify Identity (magic link / email)      |
| Storage         | Supabase (2 tables: `clients`, `analyses`) |
| Video analysis  | Gemini 2.5 Pro                             |
| Ad copy         | OpenAI — GPT-5.4, GPT-5.4 Mini, GPT-4.1, GPT-4o (runtime picker) |

---

## First-time setup

### 1. Supabase

1. Go to your Supabase dashboard → **SQL Editor**
2. Run the entire contents of `supabase/schema.sql`. This creates:
   - `clients` table (white-label brands)
   - `analyses` table (GEM results + per-client copy generations)
3. From **Settings → API**, grab:
   - **Project URL** (`https://xxx.supabase.co`)
   - **`service_role`** secret key (not `anon`)

### 2. Gemini API key

Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). For team use, enable billing on the Google Cloud project tied to the key.

### 3. OpenAI API key

Get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys). Make sure the org has credit and at minimum **GPT-5.4 Mini** access (the default model). If your org doesn't have GPT-5.4 access yet, users will see model-access errors when selecting it — change the default in `src/prompts.js` to a model you do have (like `gpt-4.1`).

### 4. Deploy to Netlify

```bash
npm install
npx netlify deploy --prod
```

Or connect the GitHub repo in the Netlify UI.

### 5. Enable Netlify Identity

In the Netlify dashboard for this site:

1. **Site configuration → Identity → Enable Identity**
2. **Registration preferences**: set to **Invite only** — this is critical, it keeps the tool internal
3. **Emails**: optionally customize the invite/confirmation templates
4. **Invite users**: add each Upfrog team member's email. They'll get a magic-link email to set a password.

### 6. Environment variables

In **Site configuration → Environment variables** add all four:

| Key                    | Source                                   |
| ---------------------- | ---------------------------------------- |
| `GEMINI_API_KEY`       | Step 2                                   |
| `OPENAI_API_KEY`       | Step 3                                   |
| `SUPABASE_URL`         | Step 1                                   |
| `SUPABASE_SERVICE_KEY` | Step 1 (the `service_role` key)          |

Trigger a redeploy (Deploys → Trigger deploy).

### 7. Done

Team visits the URL → signs in → adds clients → analyzes videos → generates branded copy.

---

## Daily workflow

### First time: add your clients

1. Click **Clients** in the top-right (the button shows the count)
2. Click **+ Add client** and fill in:
   - **Business name** (required) — e.g. "Semper Fi Heating & Cooling"
   - **Location / service area** — e.g. "Mesa, AZ"
   - **Vertical** — e.g. "HVAC"
   - **Tone / voice** — free-form guidance, e.g. "Faith-based, family-owned, military veteran-led. Warm and direct. Avoid corporate jargon."
   - **Notes** — current offers, promos, anything the copy should know about

Add one entry per white-label brand. These are reused across all analyses.

### Analyze a video

1. Paste a YouTube URL or drop in an MP4/MOV (20MB max)
2. Click **Run GEM analysis**
3. Gemini returns a 26-column pipe-separated row (columns A–Z)
4. Click the card to see the full analysis
5. Use **Copy as TSV** to paste directly into a Google Sheet

### Generate ad copy per client

1. Open any analysis card
2. Click the **Ad Copy** tab
3. Click **+ Generate for client**
4. Pick a client brand and an OpenAI model (GPT-5.4 Mini is a solid default)
5. Click **Generate copy** → ~10 seconds later you get:
   - Super Long Form (narrative, emotional)
   - Long Form (Problem → Agitation → Solution)
   - Medium Form (fast + CTA)
   - Short Form (direct + punchy)
   - Ultra Short (scroll stopper)
   - 5 headlines (8 words max, per-item copy buttons)
6. Repeat for other clients — each generation is saved
7. Use the **View generation** dropdown to switch between all saved copies

---

## Why two models

- **Gemini 2.5 Pro** handles the video analysis because it has the best native video understanding (reads the actual frames and audio)
- **OpenAI** writes the ad copy because it's the team's preferred tone for Meta ads

The handoff point is the GEM row: it's pure text, so the copy model never needs to re-watch the video. That makes copy generation cheap (~$0.01 per client on GPT-5.4 Mini) and lets you fork copy for dozens of clients from a single video analysis.

---

## Local dev

Install Netlify CLI once:

```bash
npm install -g netlify-cli
```

Create `.env` at project root (copy from `.env.example`):

```
GEMINI_API_KEY=...
OPENAI_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
```

Link to the deployed site (so Identity works locally):

```bash
netlify link
```

Run dev:

```bash
netlify dev
```

Opens at `localhost:8888`. Don't use plain `npm run dev` — functions + Identity won't work.

---

## Limits to know

| Limit               | Value       | Notes                                                          |
| ------------------- | ----------- | -------------------------------------------------------------- |
| File upload size    | 20 MB       | Netlify sync functions cap payloads at ~6MB; base64 inflates 33% |
| YouTube URL         | No cap      | Passed to Gemini as URL, Gemini fetches it directly            |
| YouTube visibility  | Public only | Private/unlisted rejected by Gemini                            |
| Function timeout    | 26 s free   | Upgrade to Netlify Pro for heavy use                           |
| Dashboard records   | 200         | Hardcoded in `records.js` — raise if needed                    |
| Clients list        | 500         | Hardcoded in `clients.js`                                      |

For >20MB uploads, swap `analyze-video.js` to use Google's File API flow ([docs](https://ai.google.dev/gemini-api/docs/video-understanding)) — handles up to 2 hours of video.

---

## Troubleshooting

### "Not authenticated"
- Netlify Identity not enabled in dashboard
- User hasn't accepted their invite yet
- Token expired — sign out and back in

### "OpenAI API error — model not found"
- Your org doesn't have access to that model. Change `DEFAULT_MODEL` in `src/prompts.js` to one you do have (e.g. `gpt-4.1`), or remove unavailable models from `OPENAI_MODELS`.

### "Invalid JSON" on copy generation
- Rare with `response_format: json_object` enabled, but if it happens: click **+ Generate for client** again. Lower temperature in `generate-copy.js` if persistent.

### "No clients" in the generator
- Click the **Clients** button top-right, add at least one brand, then retry.

### "DB insert failed"
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (not `anon` — must be `service_role`)
- Re-run `supabase/schema.sql` if tables are missing

---

## File structure

```
.
├── index.html
├── netlify.toml
├── package.json
├── vite.config.js
├── .env.example
├── README.md
├── supabase/
│   └── schema.sql                   # clients + analyses tables
├── netlify/functions/
│   ├── _shared.js                   # auth + Supabase helpers
│   ├── analyze-video.js             # Gemini video → GEM row → DB insert
│   ├── generate-copy.js             # OpenAI + client context → append to copy_generations
│   ├── records.js                   # list + delete analyses
│   └── clients.js                   # CRUD: list, create, update, archive
└── src/
    ├── main.jsx
    ├── App.jsx                      # orchestrates auth, data, modals
    ├── styles.css
    ├── api.js                       # auth-wrapped fetch client
    ├── prompts.js                   # GEM prompt + OpenAI model list + column defs
    └── components/
        ├── Header.jsx               # logo, clients button, user chip
        ├── SignInGate.jsx           # unauth'd screen
        ├── UploadPanel.jsx          # YouTube URL + file upload
        ├── AnalysisCard.jsx         # dashboard card (w/ copy count)
        ├── DetailModal.jsx          # full view: GEM table + per-client copy
        └── ClientsManager.jsx       # clients CRUD modal
```

---

## Data model

### `clients`
```
id              uuid pk
business_name   text (required)
location        text
vertical        text
tone_voice      text
notes           text
archived        bool (soft-delete)
created_by_email text
created_at / updated_at
```

### `analyses`
```
id                uuid pk
source            'youtube' | 'upload'
source_label      text (URL or filename)
gem_row           text (pipe-separated A-Z)
copy_generations  jsonb array of {
                    id, client_id, client_name, client_location, client_vertical,
                    model, created_at, created_by_email, usage,
                    super_long_form, long_form, medium_form, short_form, ultra_short,
                    headlines: [...]
                  }
created_by_id / created_by_email
created_at
```

Each analysis can have unlimited copy generations. Each generation snapshots the client context at the time of generation, so archiving or editing a client later doesn't change historical copy.

---

## Switching models

### Gemini (video analysis)
Edit `GEMINI_MODEL` in `netlify/functions/analyze-video.js`:
```js
const GEMINI_MODEL = 'gemini-2.5-pro'  // or 'gemini-2.5-flash' for speed
```

### OpenAI (ad copy)
Edit `OPENAI_MODELS` and `DEFAULT_MODEL` in `src/prompts.js`, and `ALLOWED_MODELS` in `netlify/functions/generate-copy.js`. Keep these three in sync.

---

## Future enhancements

- **Filter analyses by client** — "show me every video we've analyzed that has copy for Client X"
- **CSV export** — download all GEM rows as a single CSV
- **Video thumbnails** — save a frame from Gemini for visual card previews
- **Flag "winner" copy** — mark which generation actually ran and performed
- **Regenerate with notes** — "rewrite the medium form, make it more urgent"
- **Bulk generate** — one click to generate copy for every active client at once
