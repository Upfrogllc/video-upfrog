// Shared prompts, schema definitions, OpenAI model list.

export const GEM_ANALYSIS_PROMPT = `You are the GEM (Generative Evaluation Method) Video Analyzer, a world-class marketing creative analyst with expertise in behavioral psychology, scroll-stopping advertising, and viral ad mechanics.

Your task is to deconstruct this video into structured marketing intelligence across FOUR layers:

LAYER 1 — VISUAL ENTITY IDENTIFICATION (The "Nouns")
- Setting
- Persona (approx age, style/fashion, personality cues)
- Persona Energy (calm / friendly / urgent / confident / relatable)
- Product Fingerprint (shape, color, usage, context of use)
- Implicit Product Category

LAYER 2 — SEMANTIC & AUDIO SENTIMENT
- OCR text (read all visible text in the video)
- Trope Stacks (e.g. "Before vs After", "Zero-Prep Solution", "Hidden Problem", "Expert Explains", "Life Hack")
- Music / Audio (BPM estimate, emotional tone)
- Cut pacing (slow / medium / fast)
- Voice Transcript
- Problem / Solution Phrases

LAYER 3 — BEHAVIORAL PATTERN MATCHING (Predictive Intent)
- Does the creative appeal to Slow Scrollers (minimalist, storytelling) or Fast Scrollers (bold text, high motion)?
- Predictive Intent: research / compare / solve a problem / impulse purchase
- Creative Similarity Score (Andromeda Filter) — score 1-100 vs historically high-performing ads

LAYER 4 — FUNNEL SEQUENCE PLACEMENT
- Viewer Archetype: The Skeptic (needs social proof) / The Researcher (needs explanation) / The Impulse Buyer (reacts to fast offers)
- Sequence Order: 1st Touch / 2nd Touch / 3rd Touch
- Social proof density
- Conversion window
- Funnel stage

OUTPUT FORMAT — CRITICAL:
Return ONE SINGLE LINE of values separated by the pipe character |.
No headers, no labels, no explanations, no preamble, no quotation marks around values, no newlines inside values.
Order the values exactly as columns A-Z below. If a value is unknown, write "—" (em dash). Never leave a column empty.

A: Filename
B: Visual Entity ID
C: Visual Setting
D: Persona Age/Style
E: Persona Energy
F: Product Fingerprint
G: Implicit Category
H: OCR Text
I: Trope Stack
J: Audio BPM/Vibe
K: Cut Pace
L: Voice Transcript
M: Problem/Solution Phrases
N: Predictive Intent
O: Aesthetic Scroll Correlation
P: Historical Sequence
Q: Andromeda Score
R: Fatigue Risk
S: Sequence Order
T: User Archetype
U: Social Proof Density
V: Conversion Window
W: Target Age
X: Target Lifestyle
Y: Target Behavior
Z: Final Funnel Stage

Output ONLY the single pipe-separated row. Nothing else.`

// OpenAI models available to the user at copy-generation time
export const OPENAI_MODELS = [
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    desc: 'Flagship · best reasoning & creative',
    tier: 'flagship'
  },
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    desc: 'Balanced · recommended default',
    tier: 'balanced'
  },
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    desc: 'Long context · reliable',
    tier: 'legacy'
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    desc: 'Legacy flagship',
    tier: 'legacy'
  }
]

export const DEFAULT_MODEL = 'gpt-5.4-mini'

// 26 GEM columns
export const GEM_COLUMNS = [
  { key: 'A', label: 'Filename' },
  { key: 'B', label: 'Visual Entity ID' },
  { key: 'C', label: 'Visual Setting' },
  { key: 'D', label: 'Persona Age/Style' },
  { key: 'E', label: 'Persona Energy' },
  { key: 'F', label: 'Product Fingerprint' },
  { key: 'G', label: 'Implicit Category' },
  { key: 'H', label: 'OCR Text' },
  { key: 'I', label: 'Trope Stack' },
  { key: 'J', label: 'Audio BPM/Vibe' },
  { key: 'K', label: 'Cut Pace' },
  { key: 'L', label: 'Voice Transcript' },
  { key: 'M', label: 'Problem/Solution Phrases' },
  { key: 'N', label: 'Predictive Intent' },
  { key: 'O', label: 'Aesthetic Scroll Correlation' },
  { key: 'P', label: 'Historical Sequence' },
  { key: 'Q', label: 'Andromeda Score' },
  { key: 'R', label: 'Fatigue Risk' },
  { key: 'S', label: 'Sequence Order' },
  { key: 'T', label: 'User Archetype' },
  { key: 'U', label: 'Social Proof Density' },
  { key: 'V', label: 'Conversion Window' },
  { key: 'W', label: 'Target Age' },
  { key: 'X', label: 'Target Lifestyle' },
  { key: 'Y', label: 'Target Behavior' },
  { key: 'Z', label: 'Final Funnel Stage' }
]

export const AD_COPY_SECTIONS = [
  { key: 'super_long_form', label: 'Super Long Form', desc: 'Story-driven · Highly emotional · Narrative' },
  { key: 'long_form', label: 'Long Form', desc: 'Problem → Agitation → Solution' },
  { key: 'medium_form', label: 'Medium Form', desc: 'Fast readability · Clear CTA' },
  { key: 'short_form', label: 'Short Form', desc: 'Direct · Punchy' },
  { key: 'ultra_short', label: 'Ultra Short', desc: 'Scroll stopper · Max curiosity' }
]

export function parseGemRow(row) {
  if (!row || typeof row !== 'string') return {}
  const parts = row.split('|').map((s) => s.trim())
  const out = {}
  GEM_COLUMNS.forEach((col, i) => {
    out[col.key] = parts[i] || '—'
  })
  return out
}

export function gemRowToTSV(row) {
  const parts = (row || '').split('|').map((s) => s.trim().replace(/\t/g, ' '))
  while (parts.length < 26) parts.push('—')
  return parts.slice(0, 26).join('\t')
}
