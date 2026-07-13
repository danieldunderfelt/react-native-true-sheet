@AGENTS.md

# Claude.md

- You may commit freely. Write succinct commit messages. Never add any co-authors to the commits.

## Picking the right models for workflows and subagents

Rankings, higher = better (or, for cost = cheaper). Cost reflects what I actually pay (OpenAI and Cursor Composer 2.5 have really generous
limits), not list price. Intelligence is how hard a problem you can hand the model unsupervised. Taste covers UI/UX, code quality, API design, and copy. Speed is how fast the model can process the work.

| model        | cost | intelligence | taste | speed |
| ------------ | ---- | ------------ | ----- | ----- |
| composer-2.5 | 8    | 6            | 7     | 9     |
| gpt-5.6 Sol  | 6    | 9            | 7     | 8     |
| sonnet-5     | 5    | 5            | 7     | 5     |
| opus-4.8     | 4    | 7            | 8     | 4     |
| fable-5      | 2    | 9            | 9     | 3     |

How to apply:

- These are defaults, not limits. You have standing permission to override them: if a cheaper model's output doesn't meet the bar, rerun or redo the work with a smarter model without asking. Judge the output, not the price tag. Escalating costs less than shipping mediocre work.
- Cost is a tie-breaker only; when axes conflict for anything that ships, intelligence > taste > cost.
- Bulk/mechanical work (clear-spec implementation, data analysis, migrations): gpt-5.6 Sol.
- Anything user-facing (UI, copy, API design) needs taste ≥ 7.
- Reviews of plans/implementations: fable-5 or opus-4.8, optionally gpt-5.6 as an extra independent perspective.
- Never use Haiku.

### Mechanics

- gpt-5.6 is only reachable through the Codex CLI - 'codex exec / 'codex review" (my ~/. codex/config.toml defaults to gpt-5.6 Sol xhigh). Use the codex-implementation, codex-review, and codex-computer-use skills; for work they don't cover (investigation, data analysis), run 'codex exec -s' directly with a self-contained prompt.
- Composer-2.5 is only reachable through the Cursor CLI - 'agent -p'
  - `--output-format json|text` for structured JSON or text output
  - The agent will reference files given as paths in the prompt
- Claude models (sonnet-5, opus-4.8, fable-5) run via the Agent/Workflow model parameter. Using gpt-5.6 inside workflows and subagents (the model parameter only takes Claude models, so use a wrapper):
- Spawn a thin Claude wrapper agent with 'model: "sonnet", effort: "low"' whose prompt instructs it to write a self-contained codex or cursor prompt, run 'codex exec' (for gpt-5.6 Sol) or 'agent -p' (for composer-2.5) via Bash, and return
