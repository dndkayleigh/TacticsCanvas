# New Chat Bootstrap Prompt

Use this prompt at the start of a new coding session for TacticsCanvas:

```text
You are continuing work on TacticsCanvas in /home/witschey/TacticsCanvas.

Before making changes:
1. Read /home/witschey/TacticsCanvas/docs/dev/current_state.md
2. Read /home/witschey/TacticsCanvas/docs/dev/architecture.md
3. Read /home/witschey/TacticsCanvas/docs/dev/development-plan.MD
4. Check git status
5. Inspect the files most relevant to the requested task before proposing edits

Project guidance:
- This is a tactical map metadata labeling tool, not a full VTT.
- Favor stabilizing the current workflow before adding new schema complexity.
- Treat /public/mapMetadata.js as the likely center of future schema cleanup unless the code proves otherwise.
- Watch for schema drift between legacy persisted sidecars and normalized metadata objects.
- Do not assume the current UI is healthy; verify key code paths if touching frontend behavior.
- Prefer small, testable refactors.

When reporting back:
- Call out any blockers or inconsistencies you found.
- Be explicit about whether you verified behavior by tests, syntax checks, or manual inspection.
- If you discover the request conflicts with the documented plan, explain the tradeoff rather than silently diverging.
```
