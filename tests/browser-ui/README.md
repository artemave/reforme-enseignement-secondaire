# Reader UI smoke tests

Run `bun run test:ui` to check the reader once at desktop size (1440 × 1000) and once with a mobile touch viewport (390 × 844). `bun run test` includes both, alongside the single-profile system scenarios and unit/integration tests. `bun run test:browser` runs all browser projects together.

This small suite checks viewport fit, a readable 320px mobile layout and the footer GitHub link, discussion/proposal icons, 44px annotation hit targets, system dark mode, continuous bubble hover color, hamburger contents navigation at every screen size, direct bubble navigation to passage pages, keyboard activation, returning to the document, and the local embedded comment form on an empty passage. Desktop controls use mouse clicks; mobile controls use taps. Failures retain screenshots and traces in the Playwright report.

Given/When/Then business scenarios remain in `tests/system/` and run once. System and UI suites run in parallel, with a private fixture server and repository for each worker. These UI checks reuse the same isolated repository setup without repeating issue/PR lifecycle scenarios across viewport sizes. They are functional smoke checks, not pixel-by-pixel screenshot comparisons.
