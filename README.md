# Roots

**Grandparent stories become bilingual storybooks — built for the Meta Global AI Developer Hackathon (Cerebral Valley), Oct 26 – Nov 4, 2026.**

- **Track:** Indie developer (solo)
- **Theme:** Build for Your World
- **One line:** A grandparent speaks or writes in their own language, and their grandchild gets a storybook they can actually understand — the original and the translation side by side, with the care and the idioms explained, not just translated word for word. Input and output languages are chosen from dropdowns (Tamil, English, Hindi, Telugu, Malayalam, Kannada, Bengali, Punjabi, Marathi, Gujarati, Spanish, French, German, Italian, Portuguese, Russian, Arabic, Chinese, Japanese, Korean), defaulting to Tamil → English.
- **Status:** Working application, built Nov 3, 2026. This replaces ClaimProof as the submission; ClaimProof remains in its own repo and artifacts, parked, not deleted.

> **Submission deadline:** Wed Nov 4, 2026, 9:00 PM ET / 6:00 PM PT, via the Cerebral Valley portal.

## Run it

This is a Next.js app (App Router, React 19). The Roots experience lives in `app/page.tsx` — a port of the standalone MVP, feature for feature.

```bash
npm install
npm run dev
```

Open http://localhost:3000. No server-side storage: books save in the browser, and the only network calls are the Meta Model API calls the user explicitly enables with their own key.

## The problem, firsthand

Kids in San Jose, grandparents in Chennai. When a little one broke his arm, the care his grandparents showed — in Tamil, in the words and blessings a Tamil family actually uses — did not translate well for the kids to understand. They heard the love in the voice and missed the meaning in the words. That is the gap Roots closes: not a language lesson, and not a literal translation, but a storybook that carries both the words and the warmth across.

## How to use

1. **The story or message:** pick the input and output languages, type the story in the input language, or record a voice note (recording stays on the device, played back in the browser) and type what was said.
2. **Make my book:** the story splits into pages, Tamil on each page.
3. **Output-language side:** with a Meta Model API key (entered in the tab, never stored), Muse Spark translates each page with cultural context and explains idioms, blessings, and expressions. Without a key, the output side stays editable — fill it in yourself, and the book still works.
4. **Hear it:** tap 🔊 on any page to hear the input language or the output language, using the device's voice for that language if installed.
5. **Illustrations:** with a key, Muse Image illustrates each page in a consistent storybook style. Without a key, pages show a placeholder.
6. **Keep it:** save the book in the browser, or download it as a standalone HTML file to share with family.

The app starts blank. A "Load a fictional example" button loads a short fictional story only — clearly labeled, never a real child's story or photo.

## How it works

```
Tamil story / voice note
        │
        ▼
page splitter (rule-based, no key needed)
        │
        ├─► Muse Spark ──► English translation + idiom/culture note per page (key only)
        ├─► Muse Image ──► one storybook illustration per page (key only, $0.01/page)
        └─► browser speech ──► tap-to-hear in Tamil and English (no key needed)
        │
        ▼
bilingual book: Tamil + English + note + illustration, editable, saveable, exportable
```

## Use of Meta AI tooling

| Model | Where it is used | Why that model, specifically |
|---|---|---|
| **Muse Spark** (`muse-spark-1.3`) | Translates each page and explains idioms, blessings, and cultural expressions | Translation here is a judgement call about warmth and context, not a dictionary lookup — Spark handles the nuance |
| **Muse Image** (`muse-image-1.0`) | Illustrates each page in a consistent storybook style | One model, one style across pages, so the book feels like a book |
| **Muse Wonder** | Future: describe a family photo so its illustration matches the real scene | Listed as future only — not shipped, not claimed |
| **SAM 3.1** | Future: keep a subject consistent across illustrations | Listed as future only — not shipped, not claimed |

**Honest state of the live path:** the app calls the Meta Model API directly from the browser (`https://api.meta.ai/v1`, Bearer key entered in the tab, never stored or sent anywhere else) — Spark via `/chat/completions`, Image via `/images/generations`. These calls have not yet been exercised against a live key, because the $150 credit key has not arrived yet. Without a key the app runs in labelled local mode and never presents a rule-based result as a model result. An API error is shown in plain text and leaves the editable English side untouched. At $0.01 per illustration, a 6-page book costs $0.06 in images.

## Technical depth

- **Next.js app:** `app/page.tsx` is a client component holding the whole Roots experience — story input, voice recording, page splitting, tap-to-hear, editable translations, save/export. The standalone single-file MVP it was ported from lives in the `k-sangili/roots` repo.
- **Deterministic fallback:** page splitting is rule-based and auditable; the book is fully usable without any model call.
- **Privacy by design:** voice recordings and stories stay in the browser; the only network calls are the ones the user explicitly enables with their own key, to Meta's API.
- **Human-in-the-loop by design:** every English line is editable, and every translation note is shown next to the page it belongs to.
- **Tested:** browser test Nov 3, 2026 — fictional example loads, book splits into pages, page flip works, English editing works, export works, no console errors.

## Limitations — stated plainly

- This is a **family storybook, not a professional translation service**. Check any translation that matters before relying on it.
- Voice transcription is not automatic in v0: the grandparent records, and the text is typed (browser dictation can help where supported).
- Tamil speech playback uses the device's Tamil voice if installed; otherwise the browser falls back to its default voice.
- No accounts, no shared library, no photo upload in v0 — a book lives in the browser it was made in, or in its downloaded file.

## Roadmap (future only — not shipped)

1. Live-key verification run + demo video with a real (consented) family story
2. Automatic voice transcription of the grandparent's recording
3. Family photo upload, described by Wonder, illustrated to match
4. Saved-books library + shareable book links
5. More language pairs, starting with the languages a family actually speaks

## Judging-criteria map

| Criterion (official rules) | Where Roots answers it |
|---|---|
| Impact (30%) | A real, firsthand family gap — children losing their grandparents' language and care across continents — answered with a book a child can actually read |
| Use of Meta AI Tooling (25%) | Spark for translation with cultural context, Image for consistent storybook illustrations, each for the job only it can do |
| Technical Depth & Execution (20%) | Working app, deterministic fallback, privacy by design, editable human-in-the-loop translations, tested pages and export |
| Demo (25%) | Working app + 90-second video (link above when recorded); the demo holds up without a key and gets richer with one |

## License

MIT.
