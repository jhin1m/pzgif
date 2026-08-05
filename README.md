# PZGIF

Browser-native GIF tools. Every operation runs inside your own tab — no upload,
no account, no server in the loop.

Live at **[pzgif.com](https://pzgif.com)**.

## Why the source is here

`gifski`, the encoder that makes PZGIF's output visibly better than the usual
`gif.js`/`gifenc` competitors, is AGPL-3.0. Delivering it to a browser is
conveyance, so this client is published under the AGPL too. The footer of every
page links to the exact commit that page was built from.

Site copy and brand assets are a separate work and are **not** AGPL — see
[`LICENSE-CONTENT`](./LICENSE-CONTENT) and [`NOTICE`](./NOTICE). You can run and
modify this privately with the content in place; to publish, bring your own.

## Getting started

Requires Node ≥ 20.9 and pnpm.

```bash
pnpm install
pnpm dev
```

| Command | What it does |
|---|---|
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint (Next 16 removed `next lint`) |
| `pnpm test` | Vitest |
| `pnpm test:e2e` | Playwright, against a production build |
| `pnpm check:forbidden` | Fails if anything reintroduces cross-origin isolation |
| `pnpm check:static` | Fails if any route is not statically prerendered |

## Contributing

Read [`CLAUDE.md`](./CLAUDE.md) first — it lists the three constraints that
override everything else, and the conventions that are easiest to get wrong.

## Licence

Code: [GNU AGPL-3.0-or-later](./LICENSE).
Content and brand: [all rights reserved](./LICENSE-CONTENT).
