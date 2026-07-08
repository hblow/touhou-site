# Celestial Peak (`touhou-site`)

A personal Touhou fan site: Top 5 characters, media I've read, fangames I've
played, and a clouds-parting intro inspired by Tenshi Hinanawi.

**Live:** https://hblow.github.io/touhou-site/  
**Design doc:** [docs/DESIGN.md](docs/DESIGN.md)

## Disclaimer

Unofficial fan work — not affiliated with Team Shanghai Alice or ZUN.
See the site footer and [official Touhou Project news](https://touhou-project.news/).

The [MIT License](LICENSE) covers **site code only**, not Touhou IP.

## Local development

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Dev server (relative URLs)
pelican content -s pelicanconf.py -r -l

# Production dry-run (catches /touhou-site/ path bugs)
pelican content -s publishconf.py --fatal errors
```

Open `output/index.html` after a prod build and confirm asset URLs contain
`/touhou-site/`.

## Content authoring

| Section | Path | Key metadata |
|---------|------|--------------|
| Characters | `content/characters/*.md` | `Category: characters`, `Rank: 1`–`5` |
| Media | `content/media/*.md` | `Category: media`, `Read_Status`, `Media_Type` |
| Fangames | `content/fangames/*.md` | `Category: fangames`, `Play_Status` |

**Do not** use Pelican's `Status` field for progress (`completed` / `reading`).
Use `Read_Status` or `Play_Status` instead. Omit `Status` so items stay published.

Portrait paths are relative to site root output, e.g.
`Portrait: images/placeholders/character.svg`.

## CI/CD

Pushes to `main` run [.github/workflows/pages.yml](.github/workflows/pages.yml):

1. Install Python deps  
2. `pelican content -s publishconf.py --fatal errors`  
3. Smoke checks (SITEURL, theme CSS, disclaimer, articles)  
4. Deploy to GitHub Pages  

Repo setting: **Settings → Pages → Source: GitHub Actions**.

## Art policy

Prefer original placeholders, original art, or clearly permissioned fan art.
Do not host official game assets, scanlations, or pirated media.

## Project structure

See [docs/DESIGN.md](docs/DESIGN.md) for architecture, CI phasing, and the PR plan.
