Original prompt: Create a battleship game in 3d

- Initialized project for a standalone 3D-style Battleship web game.
- Plan: implement menu/play loop, pseudo-3D board rendering, ship placement, click-to-fire, AI turns, win/lose flow, fullscreen toggle, deterministic test hooks.

- Implemented core game: menu/start, random fleet placement, click-to-fire turns, enemy AI response, win/lose flow, pseudo-3D board rendering, fullscreen/restart controls, render_game_to_text, advanceTime hook.
- Fixed particle update bug (burst timers were previously decremented twice per frame).
- Ran Playwright client against http://127.0.0.1:4173 with start-button click and multiple enemy-board shots.
- Verified artifacts: output/web-game/shot-0.png, shot-1.png and state-0.json, state-1.json.
- Visual checks passed: both boards render with 3D effect, hits/misses visible, HUD updates, hover highlight shown.
- State checks passed: turn transitions, duplicate shot message, hit/miss persistence, no console error artifacts produced.

TODOs / suggestions:
- Add a dedicated in-game restart button and menu button (currently keyboard R and M only).
- Add optional difficulty levels for enemy targeting AI.
