# GrowthLoop AI — 2-minute demo script

Solo, about 280 words, for a recorded screen capture. Claude's replies take a few seconds each, so **record first and cut the waits**: every step below is one continuous clip with the spinner trimmed. Read what's on screen where the script says so, because the model's wording changes each run.

## Before recording

1. Run `npm run demo:reset -- --yes` so the run starts at `exp_001`.
2. Sign in on the preview in a clean window, and zoom the browser to about 125%.
3. Do one full rehearsal, reset, then record.

## Script

| Time | On screen | Say |
|---|---|---|
| 0:00–0:15 | `/experiments`, the Start Cycle 1 form | "This is GrowthLoop AI, a two-agent system that helps a small B2B team run marketing experiments with a human in charge. The customer is GrantReady, a hypothetical product, and every result you'll see is simulated." |
| 0:15–0:35 | Click **Create exp_001**. Open **GrantReady brief, ICP and claim registry**, then click **Generate A/B drafts** | "I start with one hypothesis and one variable to test: the hook. The Content Agent can only use claims from this registry. Rejected claims, like a promise to win grants, are blocked. Claude writes the control and one variant, and only the hook differs." |
| 0:35–0:50 | Show both drafts, then click **approve** on each | "Every draft is labeled as a demonstration, and nothing moves until a person approves it. I'm approving both. Nothing here publishes automatically." |
| 0:50–1:15 | Click **Load metrics**, scroll to the table and the quarantine note, then click **Run Analytics Agent** | "Now I load simulated results. The system does the math, not the AI, and it quarantined two bad rows. The variant reached 15 percent qualified demos per visit, against 10 percent for the control. The Analytics Agent can only cite these stored metrics, and it has to state its uncertainty." |
| 1:15–1:40 | Show the proposal: findings, uncertainty, the proposed change. Pick **Variant did better**, click **Approve proposal** | "It proposes exactly one change, with a stop rule. Here it suggests [read the proposed change]. The numbers are simulated, so this isn't proof of what works, and that's why I make the call. I'll record that the variant did better, and approve." |
| 1:40–1:55 | Click **Next cycle: exp_002**. Show the approved findings and both drafts | "Cycle 2 starts from saved Experiment Memory. The variant is now the baseline, and the only change is the one I approved. These drafts wait for human review again." |
| 1:55–2:00 | Stay on `exp_002` | "That's the loop: two agents, one human in charge. Thank you." |

## Keep it accurate

- **Say "simulated"**, and never suggest the 15 percent caused anything. It's pre-authored fixture data.
- **Don't say "live" or "published".** Nothing goes to LinkedIn.
- **Don't say Michelle reviewed the claims or the Claude-backed Content Agent.** Shawn recorded himself as reviewer, and she hasn't reviewed that branch.
- **Cycle 2 copy isn't newly written by Claude.** The Analytics Agent proposes the replacement text, a human approves it, and the system applies it.
- **The approve clicks are role labels.** The app records "content reviewer" and "experiment approver", not a verified person.
