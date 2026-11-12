# Conspiracy Theories

Course site for https://jboyce1.github.io/ConspiracyTheories/.

The layout follows ZombieInvasionPrep, with a charcoal, teal, and amber palette. The left sidebar indexes the current lesson; the right sidebar provides course navigation.

## Source and publication

- `docs/` contains the complete static website, including lessons and downloadable materials.
- `scripts/build_site.py` converts the local `SharePoint_Raw/` archive into course pages. It requires Python 3 and Beautiful Soup (`beautifulsoup4`). The raw archive is intentionally excluded from Git.
- `migration-report.json` records the extraction and remaining SharePoint text links.
- CSS and JavaScript live in `docs/assets/` and can be edited directly.

The original saved pages contain unloaded SharePoint web parts. Downloaded worksheets and media are provided in lesson download sections. Original lesson PDFs are also available for reference.

GitHub Pages publishes the `docs/` directory from the `main` branch using its built-in branch publishing.
