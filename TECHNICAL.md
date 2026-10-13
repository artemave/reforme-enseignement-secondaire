# GitHub-backed document annotations

A static French-language Markdown reader for `reforme-enseignement-secondaire`. GitHub holds the document and Discussions. GitHub Actions builds a derived annotation index and deploys the reader to GitHub Pages. There is no database, application server or website sign-in.

The published document is `content/document.md`. Development and tests use the separate stable document in `dev/fixtures/document.md`.

## Run locally

Requires Node.js 22.12+, Google Chrome and Playwright WebKit for browser tests. Chrome is included in `Dockerfile.dev`; on Ubuntu/Debian, install it with `npx playwright install --with-deps chrome webkit` after `npm ci`.

```sh
npm ci
npm run check
bun run dev
```

Open the URL printed by Vite. Development starts with fixture discussions and the local GitHub backend. Use `bun run dev:plain` to read without fixtures; without synchronisation, that reader has an empty annotation index. `npm run build` creates `dist/`, which can be served from any static host, including a repository subpath. After changing the document in plain mode, remove the derived `public/annotations.json` before restarting, or run a real synchronisation. Production refuses an index from a different document or configuration.

## Develop with discussions

```sh
bun run dev
```

`bun run dev:fixtures` remains an alias for the same mode. Open the printed Vite URL. The blue development banner identifies the fictional data and links to **Simuler GitHub**. Examples include annotations on a title, a section and paragraphs; two discussions on the same passage; a discussion matched through its original description; an unmatched discussion; and closed discussions excluded from the reader.

GitHub links in this mode go to local simulation pages, including opening links in a new tab. Descriptions link back to the document passage; bot comments contain only links to related discussions, when any exist. Leave a first comment to create a discussion, edit descriptions, add comments or close/reopen discussions. Every successful publication automatically refreshes open document tabs with the new annotations; no manual rebuild or browser refresh is needed. The simulator also lets you change the document in memory, trigger an unchanged rebuild, reset the examples, and simulate/recover from a matching outage. Return to **Lire le document** when navigating in one tab. State lasts until reset or server restart; no repository files or real GitHub items are changed.

The fake serves GitHub REST/GraphQL responses to the **real** adapter and supplies a deterministic, exact-quotation model double to the **real** matcher and synchronisation code. It needs no credentials and has no network fallback. This exercises workflow behavior, including original descriptions, exact-target cross-references and idempotent comments, without pretending to test real AI judgment.

Fixture mode serves its index from memory; it never overwrites `public/annotations.json`. The simulator and its navigation hook are enabled only by the explicit development mode. Production builds, including `vite build --mode fixtures`, do not install that plugin or publish its server endpoints.

## Automated tests

`bun run test` (or `npm test`) runs all unit, integration, system and UI tests. A failure in any suite fails the command. Use `bun run test:unit` for unit/integration tests, `bun run test:system` for the system scenarios, `bun run test:ui` for desktop/mobile UI smoke checks and mobile WebKit scroll restoration, or `bun run test:browser` for all browser tests.

[The publication integration test](tests/annotation-publication.test.ts) covers one complete open/close cycle through HTTP, the shared GitHub backend, the real adapter/matching/synchronisation pipeline, published annotation JSON and bot comment reconciliation. Given/When/Then system scenarios separately check business outcomes through reader and GitHub actions.

```sh
npm run test:system
npm run test:system:ui
npm run check:all
```

The first command runs each Given/When/Then system scenario once in real Chrome. The second opens Playwright's interactive runner. The third runs TypeScript, lint, 100% unit/integration coverage and the browser suite. Chrome is included in `Dockerfile.dev`; on Ubuntu/Debian and in CI, `npx playwright install --with-deps chrome webkit` installs it. Each test resets and reuses the same fake backend as the interactive simulator, and fails on external browser requests.

Read [the workflow descriptions](tests/system/README.md) or the [scenarios grouped by behavior](tests/system/). Failures retain traces/screenshots under `test-results/` and a report under `playwright-report/`; CI saves them as artifacts. These tests cover the reader and local synchronisation behavior, rather than real GitHub/AI service availability or Actions/Pages infrastructure.

The separate [UI smoke suite](tests/browser-ui/README.md) runs once on desktop and once on a mobile touch viewport. It checks screen fit, navigation, dialog controls, focus and contribution links. System scenarios run once, without a viewport matrix. Browser suites run in parallel using Playwright’s default worker count, each with its own fixture server and repository.

## Enable GitHub Pages

1. Commit and push this implementation to the repository's default branch.
2. Under **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. Under **Settings → Secrets and variables → Actions**, add the secret `AI_API_KEY` for your matching provider. The default uses the OpenAI Chat Completions API with `gpt-4.1-mini`; optional repository variables `AI_MODEL` and `AI_ENDPOINT` select another model and HTTPS endpoint supporting strict JSON-schema output. The key is available only to the synchronisation step.
4. If publishing under a custom domain, set the repository variable `SITE_URL` to the full public site URL, with its trailing slash. This is used for links to published passages.
5. Run **Actions → Synchronise and publish → Run workflow**. `GITHUB_TOKEN` is supplied by Actions with scoped permissions; no personal GitHub token is needed for deployment.

The default Pages URL is `https://artemave.github.io/reforme-enseignement-secondaire/`. It becomes available after a successful deployment. Repository or organisation policies must allow Actions to write Discussion comments and deploy Pages. If the `github-pages` environment restricts branches, allow the default branch and privileged event runs that use that branch.

Local synchronisation also works with `GITHUB_REPOSITORY`, `GITHUB_TOKEN`, and `AI_API_KEY` supplied through the environment:

```sh
npm run sync
npm run build
```

Do not put secrets in tracked files. Other environment options: `DOCUMENT_PATH` (default `content/document.md`), `DOCUMENT_BRANCH` (default `main` locally; Actions uses the repository's actual default branch), and `BOT_LOGIN` (default `github-actions[bot]`). The supplied Actions workflow uses that default bot identity.

## Reader behaviour

Each title, heading, and top-level Markdown block has a target and an accessible annotation control. Lists, tables, blockquotes and fenced code blocks are kept intact as block targets. A number counts the comments and replies in the open Discussions mapped to that target, excluding the bot’s “Autres discussions” comments. Both numbered and empty bubbles navigate directly to the passage’s discussion page. The document title links to its discussion area on the root page. Empty passages show the giscus comment form; posting the first comment creates the Discussion.

Every target embeds its existing GitHub Discussion, or shows a comment form that creates one on the first comment in the General category. New thread titles contain the document revision, target ID and a passage excerpt, providing context for matching.

Publication renders the document, paragraph/section pages and help page as complete static HTML using the generated annotation index. The browser activates controls without replacing the published content, checks `annotations.json` without caching to refresh stale publications, and loads Discussions through giscus into reserved space. Fixture development uses the same renderer. Markdown HTML is sanitised, and GitHub item titles are inserted as text. The reader has keyboard focus styles, a skip link, responsive layouts and reduced-motion support.

## Matching and derived index

For every open item, synchronisation submits the full current document's units and context, the current description, available original description, description history, labels, Discussion comments and nested replies to the AI matcher. All REST and GraphQL connections are paginated. The annotation bot’s marked comments are excluded from matching to avoid feeding its own output back into the model; unrelated automated comments remain available.

GitHub's `UserContentEdit.diff` field contains historical body versions. The original is selected from the oldest version only when `includesCreatedEdit` confirms creation data exists. An unedited item's current description is its original. Removed/missing creation history is represented as unavailable, never fabricated; available other historical versions still supply additional context. See the [GitHub history fields](https://docs.github.com/en/graphql/reference/issues#issue) and [GitHub API history examples](https://github.com/orgs/community/discussions/33551).

The model returns at most one target ID or `null`, confidence, verbatim supporting text, and a reason. A match is accepted only when the target exists in the current document, confidence is at least `0.9`, and the nonempty supporting quotation occurs verbatim in that target's Markdown. The prompt prefers no match for ambiguity, removed text, or broad topics spanning targets. AI confidence is a conservative filter, not a correctness guarantee; the owner retains editorial control.

IDs are snapshot-local (`u-1`, `u-2`, …); no identity tracking across revisions is attempted. The index includes a SHA-256 digest of the exact current document. It contains display units, repository configuration, publication time and open matched item summaries. Unmatched items remain on GitHub. Raw discussions, edit history, API keys and AI reasoning are not published.

No mapping database, committed mapping file, or previous index is used during synchronisation. `public/annotations.json` is an ignored generated build input, then copied into the Pages artifact.

## Bot comments and synchronisation

Empty passages use a strict giscus lookup key, which giscus also uses as the new Discussion's title: `Discussion : <passage label> · <fingerprint>`. The fingerprint hashes the document revision, target ID and publication timestamp, so a closed thread cannot reappear through the new-discussion form. Passage pages set their meta description to the passage Markdown, which giscus copies into the Discussion body along with the page link. Open discussions are embedded by their GitHub number.

An open Discussion with other **open** Discussions mapped to the **exact same** target has one bot comment marked `<!-- document-annotations:v1 -->`, containing only an “Autres discussions” heading and links. Sharing a passage does not imply approval or resolution. If there are no peers, the item is unmatched, or it closes, existing annotation bot comments are removed and none are posted. Duplicate bot-owned annotation comments are removed. Human comments containing the marker are never treated as bot comments. GraphQL bot identities are normalised to the REST-style `[bot]` login so repeated rebuilds recognise the existing comment.

All AI mappings are computed before any comments are written. An AI refusal, invalid response or GitHub error fails the run and leaves the last published site intact. Once mappings succeed, comment bodies are compared before creating/updating; unchanged comments are left alone. A subsequent run reconciles partial comment-write failures.

Publication responds to default-branch pushes (including site/config/workflow changes) once the Quality workflow has passed for them, Discussion lifecycle and metadata events, Discussion comments, labels/milestones, releases, external `repository_dispatch`, external Pages builds, and manual rebuilds. A six-hour scheduled rebuild reconciles missed events, API-only history changes, and other metadata changes without their own Actions event.

The publisher always checks out the current default branch and fetches current state. It never executes PR code or downloads PR-produced artifacts. The ordinary quality workflow tests PR code without secrets or write permissions.

A single `document-pages` concurrency group serialises complete synchronisation/deployment runs with `cancel-in-progress: false`. GitHub can replace pending runs; this is safe because each run recomputes current state rather than applying event deltas. The bot's own marked Discussion comments and its Pages build notifications are ignored to prevent loops. Other bot-originated changes can still trigger publication. No Discussion is closed by this system.

## Quality gates

The Quality workflow installs Chrome and WebKit and executes `npm run check`, including all tests, on every push and pull request. Publication does not repeat these checks; a default-branch push deploys only after Quality succeeds:

- TypeScript `strict`, unchecked-index protection, exact optional properties, exhaustive-switch linting, unused-code checks, and full dependency type checking (`skipLibCheck: false`).
- ESLint's strict type-aware and stylistic configurations, strict boolean expressions, unsafe-value protection, mandatory type imports, and zero allowed warnings. One documented DOM-selector generic exception preserves typed required-element lookups.
- Vitest V8 coverage: **100% statements, branches, functions and lines for every application, command-entrypoint, development-support and Vite configuration file**. There are no application-file coverage exclusions or ignored branches. Tests exercise sanitisation, reader interactions, API errors, all pagination, missing originals, conservative AI rejection, exact-target grouping, unchanged comments, closure cleanup, entrypoints, and stale-artifact refusal.

`coverage/index.html` provides the detailed local report. Workflow definitions are also validated using actionlint in the quality workflow.

## Source layout

| Path | Responsibility |
| --- | --- |
| `content/document.md` | Published source document |
| `src/document.ts` | Current snapshot targets and contextual contribution links |
| `src/github.ts`, `src/history.ts` | Current GitHub state and original descriptions |
| `src/matcher.ts` | Structured AI decisions and conservative validation |
| `src/synchronise.ts` | Exact-target annotations and idempotent bot comments |
| `src/artifacts.ts` | Derived index and stale-snapshot protection |
| `src/ui.ts`, `src/style.css` | Static reader and discussion pages |
| `scripts/` | Local and Actions build/synchronisation entrypoints |
| `dev/` | Shared development scenario, fake backend and local simulator |
| `tests/system/` | Given/When/Then system scenarios |
| `tests/browser-ui/` | Desktop/mobile reader UI smoke checks |
| `.github/workflows/` | Quality and serialised publication |

This implementation is intended for modest document repositories. Matching sends the complete current document per open item; provider context windows, quotas and costs therefore bound scale. Reader changes on GitHub appear after the next successful build, rather than live.

Fixture-mode development (`bun run dev`) and tests use the stable example in `dev/fixtures/document.md`. The published site and `bun run dev:plain` use the real, evolving document in `content/document.md`. Edit the fixture only when changing a test scenario; normal editorial changes do not affect the test suite.

## Shareable passage pages and giscus

The document remains at `/`. Each section and paragraph has a page at `/passage/<document-sha256>/<sequential-unit-id>/`, linked directly from its annotation bubble. These pages quote the selected passage once and show its matched Discussions. The title represents the whole document and links to `/`.

Only the current revision is published. Incomplete or unknown links return to the document. Links to another revision return to the document with a notice explaining that the passage link is outdated. Static HTML pages and a custom `404.html` implement this on GitHub Pages without a routing server. Assets and annotation JSON always resolve from the repository root, including direct visits to deep URLs.

Giscus embeds the selected existing Discussion by number. Readers can switch between multiple Discussions on the same passage, read replies and comment through GitHub OAuth. Empty passages use strict term matching on the readable key described above; giscus creates a Discussion on the first comment. Enable repository Discussions, keep a General category, and install [the giscus app](https://github.com/apps/giscus) on the repository. Synchronisation discovers the public repository/category IDs; no giscus secret is needed. The frontend never receives the Actions or AI tokens.

Fixture mode replaces the giscus client script and embedded comment form with local endpoints. Both existing-thread comments and first-comment discussion creation use the shared local GitHub backend and publication pipeline; no real giscus script, iframe, OAuth or GitHub request is loaded. System tests cover shared-page commenting and expired URLs using the same backend, with external network requests blocked.
