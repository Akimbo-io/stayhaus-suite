# StayHaus Suite

Bundle of StayHaus-related projects and tools.

## Projects

- **`stayhaus/`** — StayHaus onboarding portal, docs, and agency handoff files.
- **`cocosolis-figma-translator/`** — Figma plugin for translating email designs in-place.
- **`email-remixer/`** — Email remixer (server + plugin + tests).
- **`image-translator/`** — Image translation tool (backend + frontend).
- **`video-translator/`** — Video translation tool (backend + frontend).

## Setup

Each folder is an independent project. See each one's own README / setup file:

- `stayhaus/ONBOARDING-SETUP.md`
- `email-remixer/SETUP.md`
- `image-translator/start.sh`
- `video-translator/start.sh`

## Environment variables

`.env` files are **not** committed. Projects that need API keys (Gemini, Anthropic, etc.) require you to create your own `.env` locally based on the relevant setup docs.
