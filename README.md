# Neon Rivals

A landscape-only neon arcade fighter for [Little Joy Arcade](https://littlejoyarcade.site).

Phaser 3 · TypeScript (strict) · Vite · 1280×720 FIT canvas.

Four rivals, three arenas, an arcade ladder and quick fight, a deterministic
60 Hz combat engine, and one rule that is part of the design rather than an
afterthought: **a phone held upright cannot play.** The rotation gate covers the
whole viewport, pauses the match and resumes it with a countdown when the phone
turns.

## Play

```bash
npm install
npm run dev      # http://localhost:5176
npm run build    # typecheck + production build
npm test         # 27 simulation and orientation tests
```

The deployed game is served from `https://jd4rider.github.io/neon-rivals/play/`
and is embedded by the arcade in an iframe.

## Controls

Everything works out of the box on a PC. Keyboard, controller and touch are
merged every tick, so a player can switch devices mid-match.

| Action | Keyboard | Gamepad (standard mapping) | Touch |
| --- | --- | --- | --- |
| Move | `A` / `D` or `←` / `→` | Left stick / D-pad | ◀ ▶ |
| Jump | `W` or `↑` | Stick up / D-pad up | JUMP |
| Crouch | `S` or `↓` | Stick down / D-pad down | DUCK |
| Light attack | `J` or `Z` | A / Cross | LIGHT |
| Heavy attack | `K` or `X` | B / Circle | HEAVY |
| Special (costs meter) | `L` or `C` | X / Square or RB / RT | SPECIAL |
| Guard | `I` or `Shift` | Y / Triangle or LB / LT | GUARD |
| Pause | `Esc` or `P` | Menu / Start | PAUSE pill |

Keyboard codes are physical (`event.code`), so WASD stays in the same place on
AZERTY. Browser scrolling is suppressed for every game key.

Gamepad support uses the browser's Gamepad API directly (no plugin): any
standard-mapping pad works, triggers are read as analogues with a threshold,
and dual-rumble is used on impacts where the browser exposes it.

## Combat

- 10 000-point health plus per-character multipliers; three rounds by default,
  best of three, 60-second rounds.
- Light (4-tick startup) is a fast poke. Heavy (11-tick startup) launches.
  Specials cost 30-ish meter and fire a character projectile.
- Guard is a dedicated button: it beats an attack on the same tick, reduces the
  hit to chip damage and gives blockstun. Attacking or being in hitstun drops it.
- Landing hits builds meter and a combo. Combo hits scale down to a 45 % floor.
- Projectiles travel, hit hurtboxes and cancel each other out.
- Rounds end on KO or timeout (higher health wins). A full-health KO round is a
  perfect. The match ends when a fighter takes the required rounds.
- KO, perfect, timeout, clash, block and hit all produce distinct events that
  the scene turns into particles, camera shake, rumble and sound.

The simulation is pure TypeScript and never reads the render clock. The scene
feeds it one input frame per 1/60 s tick from a fixed accumulator, which is why
rotating the phone, hiding the tab or pausing freezes the match exactly where it
was — health, positions, meters, combos, round and timer all wait.

## Landscape gate

`src/core/orientation.ts` owns all orientation behaviour:

- `shouldBlockLandscape(viewport, coarsePointer)` is pure and tested. A touch
  viewport taller than it is wide is blocked; a desktop window never is.
- The HTML overlay (`#rotate-gate`) sits above the canvas in the DOM, so it also
  covers the game inside the arcade iframe. It captures pointer input, uses
  safe-area padding and animates a phone turning sideways.
- When blocked during a fight the scene pauses the simulation and hides the
  pause menu; when landscape returns a 3-2-1 countdown resumes play. Match state
  is never reset.
- Fullscreen and `screen.orientation.lock('landscape')` are requested only on an
  explicit tap (gate button or Options). Both are allowed to fail — in an iframe
  without permissions, on iOS Safari, or with OS rotation lock. The gate still
  enforces landscape from the real viewport.

## Project structure

```
src/
  core/        audio (Web Audio synthesis), orientation gate, versioned saves
  game/        pure simulation: engine, moves, roster, AI, keyboard, gamepad
  phaser/      scenes, fighter rendering, arena backdrop, touch pad, UI kit
tests/         engine, AI, save and orientation tests
```

Rendering is procedural: fighters and arenas are drawn from primitives, and the
only textures are three tiny generated sprites (spark, glow, shard). There are
no image or audio downloads.

## Saves

`src/core/saves.ts` persists settings and lifetime records to
`neon-rivals-save-v1`, validating and clamping every field and falling back to a
clean save when the payload is corrupt. `public/arcade-client.js` mirrors that
key into a Little Joy Arcade account when the player is signed in; without an
account or network the game is fully playable and simply saves locally.

## Deployment

`.github/workflows/pages.yml` runs the tests, builds, copies the built shell
into `/play/` and publishes to GitHub Pages. The catalogue row is published with
`littlejoyarcade/scripts/publish-game.mjs` using `arcade-manifest.json`, and
`littlejoyarcade/supabase/migrations/0030_neon_rivals.sql` records the same row
for reproducible database setup.
