# howto.setup-cache-infrastructure

## .what

reference for setup cache infrastructure for browser scrapes.

## .file structure

```
src/
├── infra/
│   └── performance/
│       └── withRemoteStateCache.ts      # cache context
├── domain.objects/
│   └── AgentContext.ts                  # includes cache instance
└── domain.operations/
    └── entity/
        ├── get{Entity}.ts               # wrapped with cache
        └── set{Entity}.ts               # registers invalidation
```

## .agent context

include cache in agent context:

```ts
import { SimpleOnDiskCache } from 'simple-on-disk-cache';

interface AgentContext {
  agentOptions: {
    account: { email: string };
    remoteState: {
      cache: SimpleOnDiskCache;
    };
  };
}

// create cache instance
const cache = new SimpleOnDiskCache({
  directory: '.cache/myapp',
  defaultExpirationMs: 1000 * 60 * 60 * 24, // 24h
});
```

## .gitignore

add cache directory to .gitignore:

```
.cache/
```

## .dependencies

```bash
pnpm add with-remote-state-cache simple-on-disk-cache domain-objects hash-fns
```

## .see also

- howto.cache-browser-scrapes.md — full guide
- rule.require.remote-state-cache.md — the requirement
