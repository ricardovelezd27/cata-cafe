# Bundled PDF fonts

Used by `lib/pdf/fonts.ts` (@react-pdf cannot use variable fonts, so these are static instances).

| File | Family | Source | License |
|---|---|---|---|
| Newsreader-Regular.ttf / Newsreader-Bold.ttf / Newsreader-Italic.ttf | Newsreader 16pt (400 / 700) | https://github.com/productiontype/Newsreader (`fonts/static/ttf`) | SIL OFL 1.1 — see `OFL-newsreader.txt` |
| HankenGrotesk-Regular.ttf / HankenGrotesk-Bold.ttf / HankenGrotesk-Italic.ttf | Hanken Grotesk (400 / 700) | Static instances (wght=400/700) cut with fontTools `varLib.instancer` from the upstream variable font in https://github.com/google/fonts (`ofl/hankengrotesk`); project https://github.com/marcologous/hanken-grotesk | SIL OFL 1.1 — see `OFL-hanken.txt` |

Both are licensed under the SIL Open Font License 1.1 (embedding in PDFs and redistribution
with the application are permitted). Coverage note: neither font has Σ, ▼, ✓, ● or ○ nor emoji —
the PDF documents avoid those glyphs (vector triangle, "Sum h") and `lib/pdf/text.ts` strips emoji
from user text.
