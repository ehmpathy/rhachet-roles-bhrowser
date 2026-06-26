# rule.require.playbooks-over-adhoc

## what

browser automation MUST use playbook files, not ad-hoc shell commands.

## why

playbooks enable reuse across **code** and **robo**:

| consumer | benefit |
|----------|---------|
| code (tests, prod) | import and execute playbook as typescript module |
| robo (agents) | execute playbook via `browser.action --play` skill |

prod scrapers reuse the same playbooks:
- easy to elevate robo playbook into prod code
- easy to import prod commands for robos

### compound knowledge

every time a robot figures out a flow, that knowledge persists:

- robot discovers how to handle a captcha flow → playbook
- next robot (or same robot later) inherits that knowledge
- human reviews, hardens it, merges to prod
- now ALL robots use the battle-tested version
- quality ratchets up, never down

### zero rework

without playbooks:
- robot figures out login flow → ad-hoc commands → gone
- next robot re-discovers login flow → ad-hoc → gone
- human writes prod scraper → reimplements same logic
- triplicate effort

### trust

robots run the same code prod runs. prod is constantly exercised by robots. bugs found by robots are bugs fixed for prod. symbiosis.

### the deeper why

robot intelligence shouldn't be disposable. playbooks make robot discoveries permanent. the robot isn't just a task executor — it builds capabilities that accumulate.

- ad-hoc = ephemeral work
- playbooks = durable knowledge

ad-hoc commands (e.g., `browser.click --selector '#btn'`) cannot be:
- reused across sessions
- version controlled
- reviewed in PRs
- composed into larger workflows
- tested in isolation

## pattern

```typescript
// src/playbooks/login.play.ts
export default async (page: Page, ctx: Context) => {
  await page.goto(ctx.loginUrl);
  await page.fill('#email', ctx.credentials.email);
  await page.fill('#password', ctx.credentials.password);
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-test="dashboard"]');
};
```

**from code:**
```typescript
import login from './playbooks/login.play';
await login(page, ctx);
```

**from robo:**
```bash
browser.action --session foo --play src/playbooks/login.play.ts
```

same playbook, two consumers.

## scope

- all browser automation in this repo
- all agent-driven browser tasks

## enforcement

- ad-hoc browser commands = blocker
- playbook files = required
