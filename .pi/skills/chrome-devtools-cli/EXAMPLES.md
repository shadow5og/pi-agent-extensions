# Chrome DevTools CLI Examples

Use the wrapper:

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools
```

## Smoke test

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools --list
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools new-page --url "https://example.com" --pretty
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools take-snapshot --pretty
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools take-screenshot --pretty
```

## Form interaction

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools take-snapshot --pretty
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools fill --uid <input-uid> --value "test@example.com"
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools click --uid <submit-uid>
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools wait-for --text "Success"
```

## Debug failure

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools list-console-messages --pretty
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools list-network-requests --pretty
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools evaluate-script --function "() => document.readyState" --pretty
```
