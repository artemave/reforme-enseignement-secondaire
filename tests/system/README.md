# Reader and GitHub system scenarios

These Playwright scenarios are executable documentation for Phase 1. Each runs once in real Google Chrome; this suite has no viewport matrix. `bun run test` (or `npm test`) runs these alongside unit/integration tests and the separate [desktop/mobile UI smoke checks](../browser-ui/README.md). Use `npm run test:system` for just the system scenarios, or `npm run test:system:ui` to explore their named steps and inspect the page. `npx playwright show-report` opens the generated report; failures retain screenshots and traces.

Each scenario follows **Given / When / Then**: Given establishes and asserts the initial business state; When performs actions without assertions; Then asserts the final business outcome. Each scenario has one initial-state assertion and one outcome assertion. The suite checks system behavior, with no layout, focus, styling, dialog visibility or intermediate form assertions. Browser controls are only the means of performing reader and GitHub actions.

Environment-specific setup, reset, network isolation, publication inspection and GitHub commands live in `environment.ts`; reader commands and related-item lookup live in `document-reader.ts`. Scenario names and steps do not distinguish the backend implementation.

The suite uses the **same** development scenario, fake GitHub backend, deterministic model double, simulator forms, and synchronisation pipeline as `npm run dev:fixtures`. It does not inject finished annotation JSON or mock the reader's DOM. Changes flow through the real GitHub API adapter, original-description handling, conservative matcher validation, bot comment reconciliation and index generation before the browser sees them.

## Scenario files

- [reading-annotations.spec.ts](reading-annotations.spec.ts): follow exact-passage GitHub cross-references.
- [discussion-lifecycle.spec.ts](discussion-lifecycle.spec.ts): create, edit, close, reopen and add context to discussions.
- [passage-links.spec.ts](passage-links.spec.ts): shared-page commenting and expired revision links.
- [document-revisions.spec.ts](document-revisions.spec.ts): republish document changes and recompute targets against current text.

`document-reader.ts` and `environment.ts` keep browser mechanics out of the scenarios. Each scenario starts with fresh repository state and runs independently of file order.

## Given / When / Then coverage

| Given | When | Then |
| --- | --- | --- |
| Two discussions share a passage | Follow the other discussion’s cross-reference | The other discussion references it |
| A passage has no related items | Open a discussion from the passage | The open document gains its annotation |
| A passage has two discussions | Close the discussion | Only the other discussion remains annotated |
| A passage has a closed discussion | Reopen the discussion | Its annotation returns |
| A discussion quotes one passage | Edit it to quote another passage | Its annotation moves |
| A passage has two related items | Quote it in an unrelated discussion | That discussion joins the annotations |
| A passage has existing annotations | Insert preceding document text and publish | The annotations remain on the passage |
| A passage has existing annotations | Remove the passage and publish | Its annotations disappear |

The browser suites run in parallel using Playwright’s default worker count (half the available logical CPUs). Each worker owns a fixture server, repository state and temporary Vite dependency cache. Each test resets only its own worker’s repository. Servers use distinct ports starting at 4173, reject occupied ports rather than reusing a server, and close on worker teardown; temporary caches are removed. This keeps simultaneous scenarios and development previews isolated. Use `bun run test:browser --workers=2` to reduce concurrency on a constrained machine. Browser requests to external hosts are blocked and fail the test, so accidentally following a real GitHub link cannot silently pass.

The fake model recognises unique exact quotations. It makes workflow tests reproducible without credentials or model costs; it does **not** evaluate a live AI model's relevance judgments. The fake API implements the subset used by the real adapter, including paginated REST/GraphQL reads and bot comment writes. Real GitHub permissions, webhook delivery, Actions scheduling and Pages deployment remain outside this local suite. Unit/integration tests additionally verify unsupported API requests, malformed inputs, pagination past 100 records, serialised events and failure recovery.

Unit/integration tests enforce 100% coverage for every application, command-entrypoint and development-support file. System scenarios are an additional CI gate, with their own business-outcome assertions rather than a claimed browser coverage percentage.
