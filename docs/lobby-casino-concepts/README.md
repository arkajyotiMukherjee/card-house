# Casino lobby concepts — approval pending

The user requested three distinct casino-inspired lobby directions before any lobby layout implementation: a straightforward social casino directory, an explorable 16-bit floor, and a hybrid floor/leaderboard. [Concept B](B-walkable-casino.png) was approved. The [implementation and Discord setup](../walkable-casino.md) are documented separately.

Shared constraints: emerald felt/dark wood/cream/gold/red palette; rectangular controls; retro lettering only for large headings and short prominent values; Chakra Petch for names, stakes, captions and small controls. Chips terminology throughout. Rankings use net winnings, preserve exact chip amounts and show a crown only for a clear leader. Chat is closed by default. Keep Create Table, Leave Room and room code accessible. Table entry fees and current seat availability remain explicit. A map needs direct table access as well as walking/tap interaction.

No lobby layout has been implemented. Review and approval of a direction is required first. Font changes are local on design/hybrid-type-lobby-concepts; no PR, merge or deployment has been triggered.

## Options

- [A — The Clubroom](A-clubroom.png): direct table directory, social presence and persistent rankings.
- [B — The Walkable Casino](B-walkable-casino.png): explorable pixel floor with direct Tables alternative.
- [C — The Social Casino Floor](C-social-casino-floor.png): clickable spatial tables and a prominent leaderboard; walking optional.

Images are generated desktop concepts. Exact labels, stakes semantics (blinds/wagers versus entry fees), room data and rectangular control geometry will follow the app contract during approved implementation.

## Font implementation validation

590 client tests pass (one optional live test skipped); workspace typecheck, lint/Prettier and production build pass. [Desktop typography](typography-desktop.png) and [667×375 touch typography](typography-mobile.png) render the actual shared components in an isolated font preview, not a networked gameplay session. Local database services were unavailable; no live gameplay proof is claimed for this typography-only change. The temporary preview page was removed.
