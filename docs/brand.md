# Brand

bees are bees **and** agent robots: friendly, a little mechanical, always working together.

## Assets

| File | Use |
|---|---|
| [`assets/logo.svg`](../assets/logo.svg) | Main logo: README, docs, plugin listings. Animated; respects reduced motion. |
| [`assets/social-preview.png`](../assets/social-preview.png) | 1280×640 link-preview card (source: `social-preview.svg`). |
| [`assets/cli-banner.txt`](../assets/cli-banner.txt) | Plain-text banner shown by the `bees` CLI. |

## Palette

| Token | Hex | Used for |
|---|---|---|
| Honey | `#FFC300` | Body, wordmark |
| Hive | `#FFB703` | Badge background |
| Glow | `#4CF2FF` | Eyes, antenna lights, success accents |
| Wing | `#D7F6FF` | Wings |
| Ink | `#2B1D00` | Outlines, stripes |
| Steel | `#9AA5B8` | Arms, neck, bolts |
| Blush | `#FF8FAB` | Cheeks |

## CLI banner

The `bees` CLI prints [`assets/cli-banner.txt`](../assets/cli-banner.txt) in color: antenna lights, eyes and smile in **Glow**, head and body stripes in **Honey**, the darker stripes dim, wings in **Wing**, wordmark in **Honey** and the tagline dim. A version line and the configured tools are printed below it.

| Situation | What is shown |
|---|---|
| `bees`, `bees init`, `bees --help` in an interactive terminal | Full color banner |
| Terminal narrower than 60 columns | One line: `🐝 bees v0.1.0 — one hive, every agent` |
| `NO_COLOR` set or `--no-color` | Banner without colors |
| Not a TTY, `CI` set, `--quiet` or `--no-banner` | No banner, so logs and pipes stay clean |
| `bees --version` | Version only |
