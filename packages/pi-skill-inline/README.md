# @local/pi-skill-inline

Pi extension that allows inline skill references with `$skill-name` anywhere in a prompt.

## Features
- rewrites `$skill-name` tokens before Pi processes the prompt
- uses a cleaner, system-like inline wrapper instead of noisy loaded-skill banners
- supports multiple skill references in one prompt
- deduplicates repeated inline skill tokens
- ignores fenced code blocks
- helper commands:
  - `/skills-inline`
  - `/insert-skill <name>`
  - `/pick-skill`

## Notes
- true editor-native `$` autocomplete is not exposed by Pi extension APIs
- `/insert-skill <name>` provides command completion for discovering skill names
- `/pick-skill` provides an interactive picker workflow in the TUI
- inline expansion is applied via the `input` event before normal skill processing
