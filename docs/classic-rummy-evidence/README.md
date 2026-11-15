# Classic Rummy evidence

Rummy uses the shared classic table rails, quiet player names, readable card/count hierarchy, scene-owned prize badge and private hand band. Stock and discard remain separate from the instruction surface. Public melds have an owner-labelled bounded viewer: one meld at a time, with independent six-card pages for growing runs. Lay off uses the explicit action button. The final board ranks public deadwood scores without revealing remaining private hands.

The actual rules deal six cards at the six-player maximum and ten at two players. Drawing produces the real maximum private hand of eleven cards; the two-player case covers paging and retained selection at 667×375. The seven-card public run was built with legal draws, discards, a six-card meld and a layoff, rather than injected state.

Run against the local `room-economy-test` database on port 3000 and Vite on 5175:

```sh
/workspace/bin/pnpm --filter discord-bot exec tsx ../scripts/classic-rummy-proof.ts
RUMMY_PLAYERS=2 /workspace/bin/pnpm --filter discord-bot exec tsx ../scripts/classic-rummy-proof.ts
RUMMY_VIEWER_ONLY=1 /workspace/bin/pnpm --filter discord-bot exec tsx ../scripts/classic-rummy-proof.ts
```

Each final run uses independent desktop and touch identities, then replaces the desktop view with an independent spectator. Captures include desktop 1440×900, touch 844×390 and touch 667×375. The harness freezes HMR while preserving Vite's environment import, limits rendering to 30 FPS, compares normalized replicated rules state, and uses actual canvas input plus server reducers. All browser contexts and SDK clients close in `finally`.

The JSON proof files record actual stock/discard input from both browser identities, inspection without selection, public meld creation, layoff, stock exhaustion, completion and privacy. The two-player run additionally checks cross-page hand selection and public meld paging. Error arrays must remain empty. Help/chat/leave navigation and spectator hand privacy are included in final runs.

Focused checks: 18 tests across `rummy-driver.test.ts`, `rummy-layout.test.ts` and `rummy-classic-layout.test.ts`; targeted ESLint. Root runs final repository checks after all game clients close.

`preview/` contains the first single-view review. Files outside it are the final multiplayer captures; names begin with the player count and stage.

Selected final captures:

- Maximum six players: [desktop](6-01-opening-desktop.png), [phone](6-01-opening-mobile.png), [small phone](6-01-opening-small-mobile.png).
- Public meld viewer: [supplemental desktop](6-09-desktop-public-meld-viewer-desktop.png), [small phone](6-05-public-meld-browser-small-mobile.png). The short desktop supplement stops after creating a legal public meld and opening its viewer; it preserves the completed full-run proof metadata.
- Actual eleven-card hand after drawing: [desktop](2-02-after-stock-draw-desktop.png), [small phone](2-02-after-stock-draw-small-mobile.png).
- Selection retained across hand pages: [small phone page two](2-03-cross-page-selection-small-mobile.png).
- Seven-card public run after melding and laying off: [small phone](2-05-seven-card-public-run-small-mobile.png), [next public page](2-06-public-meld-next-page-small-mobile.png). The independent desktop remains in its ordinary table view in the full-run captures.
- Finished scores with remaining private hands still hidden: [six-player small phone](6-07-final-deadwood-small-mobile.png), [independent spectator](6-08-spectator-spectator.png).
- Machine-readable results: [six players](6-proof.json), [two-player density and meld growth](2-proof.json).
