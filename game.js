(() => {
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const startBtn = document.getElementById("start-btn");
  const menu = document.getElementById("menu");

  const BOARD_SIZE = 8;
  const SHIPS = [5, 4, 3, 3, 2];

  const state = {
    mode: "menu",
    turn: "player",
    message: "Press Start",
    playerBoard: null,
    enemyBoard: null,
    playerShots: [],
    enemyShots: [],
    enemyTargets: [],
    particleBursts: [],
    layout: null,
    winner: null,
    hover: null,
  };

  function makeGrid(fill) {
    return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => fill));
  }

  function createBoard() {
    return {
      ships: makeGrid(0),
      hits: makeGrid(false),
      misses: makeGrid(false),
      fleet: [],
      alive: SHIPS.length,
    };
  }

  function inBounds(x, y) {
    return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
  }

  function placeFleet(board) {
    SHIPS.forEach((size, shipIndex) => {
      let placed = false;
      for (let tries = 0; tries < 300 && !placed; tries += 1) {
        const horizontal = Math.random() < 0.5;
        const sx = Math.floor(Math.random() * BOARD_SIZE);
        const sy = Math.floor(Math.random() * BOARD_SIZE);
        const cells = [];
        let valid = true;
        for (let i = 0; i < size; i += 1) {
          const x = sx + (horizontal ? i : 0);
          const y = sy + (horizontal ? 0 : i);
          if (!inBounds(x, y) || board.ships[y][x] !== 0) {
            valid = false;
            break;
          }
          cells.push({ x, y });
        }
        if (!valid) continue;
        board.fleet.push({ id: shipIndex + 1, size, cells, hits: 0, sunk: false });
        cells.forEach((c) => {
          board.ships[c.y][c.x] = shipIndex + 1;
        });
        placed = true;
      }
      if (!placed) throw new Error("Unable to place ships");
    });
  }

  function boardPixelRect(origin, tile) {
    return {
      x: origin.x,
      y: origin.y,
      w: tile * BOARD_SIZE,
      h: tile * BOARD_SIZE,
    };
  }

  function setupLayout() {
    const w = canvas.width;
    const h = canvas.height;
    const tile = Math.min(56, Math.max(34, Math.floor((w - 280) / 18)));
    const gutter = Math.max(80, Math.floor(tile * 1.9));
    const boardW = tile * BOARD_SIZE;
    const ox = Math.floor((w - (boardW * 2 + gutter)) / 2);
    const oy = Math.floor(h * 0.19);

    state.layout = {
      tile,
      boardW,
      leftOrigin: { x: ox, y: oy },
      rightOrigin: { x: ox + boardW + gutter, y: oy },
      depth: Math.floor(tile * 0.34),
      waterLift: Math.floor(tile * 0.1),
    };
  }

  function startGame() {
    state.mode = "play";
    state.turn = "player";
    state.winner = null;
    state.message = "Your turn: fire on enemy waters.";
    state.playerBoard = createBoard();
    state.enemyBoard = createBoard();
    state.playerShots = [];
    state.enemyShots = [];
    state.enemyTargets = [];
    state.particleBursts = [];
    state.hover = null;

    placeFleet(state.playerBoard);
    placeFleet(state.enemyBoard);
    menu.classList.add("hidden");
    render();
  }

  function restartToMenu() {
    state.mode = "menu";
    state.message = "Press Start";
    menu.classList.remove("hidden");
    render();
  }

  function keyFor(x, y) {
    return `${x},${y}`;
  }

  function markShot(board, x, y) {
    if (board.hits[y][x] || board.misses[y][x]) return { duplicate: true, hit: false, sunk: false };
    const shipId = board.ships[y][x];
    if (shipId) {
      board.hits[y][x] = true;
      const ship = board.fleet.find((s) => s.id === shipId);
      ship.hits += 1;
      let sunk = false;
      if (ship.hits >= ship.size && !ship.sunk) {
        ship.sunk = true;
        board.alive -= 1;
        sunk = true;
      }
      return { duplicate: false, hit: true, sunk, shipId };
    }
    board.misses[y][x] = true;
    return { duplicate: false, hit: false, sunk: false };
  }

  function addBurst(x, y, color) {
    state.particleBursts.push({ x, y, t: 0.35, color });
  }

  function boardCenterCell(layoutOrigin, tile, x, y) {
    return {
      x: layoutOrigin.x + x * tile + tile / 2,
      y: layoutOrigin.y + y * tile + tile / 2,
    };
  }

  function registerPlayerShot(cellX, cellY) {
    if (state.mode !== "play" || state.turn !== "player") return;
    const result = markShot(state.enemyBoard, cellX, cellY);
    if (result.duplicate) {
      state.message = "Already targeted. Choose another enemy cell.";
      return;
    }

    const shotKey = keyFor(cellX, cellY);
    state.playerShots.push(shotKey);
    const center = boardCenterCell(state.layout.rightOrigin, state.layout.tile, cellX, cellY);
    addBurst(center.x, center.y, result.hit ? "#ff6e5e" : "#74d5ff");

    if (result.hit) {
      state.message = result.sunk ? "Direct hit. Enemy ship sunk!" : "Direct hit!";
    } else {
      state.message = "Miss. Enemy preparing response...";
    }

    if (state.enemyBoard.alive <= 0) {
      state.mode = "over";
      state.winner = "player";
      state.message = "Victory! Enemy fleet destroyed.";
      menu.classList.remove("hidden");
      return;
    }

    state.turn = "enemy";
    scheduleEnemyTurn();
  }

  function buildEnemyCandidates() {
    const open = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        if (!state.playerBoard.hits[y][x] && !state.playerBoard.misses[y][x]) {
          open.push({ x, y });
        }
      }
    }
    return open;
  }

  function scheduleEnemyTurn() {
    setTimeout(() => {
      if (state.mode !== "play" || state.turn !== "enemy") return;
      const options = buildEnemyCandidates();
      if (!options.length) return;
      const pick = options[Math.floor(Math.random() * options.length)];
      const result = markShot(state.playerBoard, pick.x, pick.y);
      const center = boardCenterCell(state.layout.leftOrigin, state.layout.tile, pick.x, pick.y);
      addBurst(center.x, center.y, result.hit ? "#ff826e" : "#83d4ff");
      if (result.hit) {
        state.message = result.sunk ? "Enemy sunk one of your ships!" : "Enemy scored a hit!";
      } else {
        state.message = "Enemy missed. Your turn.";
      }
      state.enemyShots.push(keyFor(pick.x, pick.y));

      if (state.playerBoard.alive <= 0) {
        state.mode = "over";
        state.winner = "enemy";
        state.message = "Defeat. Your fleet has been sunk.";
        menu.classList.remove("hidden");
        return;
      }

      state.turn = "player";
    }, 540);
  }

  function shade(hex, factor) {
    const value = hex.startsWith("#") ? hex.slice(1) : hex;
    const n = parseInt(value, 16);
    const r = Math.min(255, Math.max(0, Math.floor(((n >> 16) & 0xff) * factor)));
    const g = Math.min(255, Math.max(0, Math.floor(((n >> 8) & 0xff) * factor)));
    const b = Math.min(255, Math.max(0, Math.floor((n & 0xff) * factor)));
    return `rgb(${r},${g},${b})`;
  }

  function drawCuboid(x, y, w, h, d, topColor) {
    ctx.fillStyle = shade(topColor, 0.73);
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w + d, y - d);
    ctx.lineTo(x + w + d, y + h - d);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shade(topColor, 0.57);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w + d, y + h - d);
    ctx.lineTo(x + d, y + h - d);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = topColor;
    ctx.fillRect(x, y, w, h);
  }

  function drawBoard(board, origin, revealShips, title) {
    const { tile, depth, waterLift } = state.layout;
    const palette = {
      water: "#2f78b7",
      ship: "#d8e3f2",
      miss: "#9dd9ff",
      hit: "#ff5d4f",
      sunk: "#9e1d19",
      grid: "rgba(255,255,255,0.24)",
    };

    const rect = boardPixelRect(origin, tile);
    drawCuboid(rect.x, rect.y + waterLift, rect.w, rect.h, depth, "#2f78b7");

    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const cx = origin.x + x * tile;
        const cy = origin.y + y * tile;
        const hasShip = board.ships[y][x] > 0;
        const hit = board.hits[y][x];
        const miss = board.misses[y][x];

        let topColor = palette.water;
        let z = waterLift;

        if (hasShip && revealShips) {
          topColor = "#c9d5e6";
          z = depth + 3;
        }

        if (hit && hasShip) {
          const ship = board.fleet.find((s) => s.id === board.ships[y][x]);
          topColor = ship && ship.sunk ? palette.sunk : palette.hit;
          z = depth + 3;
        }

        drawCuboid(cx, cy - z, tile, tile, Math.floor(depth * 0.45), topColor);

        if (miss) {
          ctx.fillStyle = palette.miss;
          ctx.beginPath();
          ctx.arc(cx + tile * 0.5, cy + tile * 0.5 - z, tile * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }

        if (hit) {
          ctx.strokeStyle = "#fff8";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx + tile * 0.25, cy + tile * 0.25 - z);
          ctx.lineTo(cx + tile * 0.75, cy + tile * 0.75 - z);
          ctx.moveTo(cx + tile * 0.75, cy + tile * 0.25 - z);
          ctx.lineTo(cx + tile * 0.25, cy + tile * 0.75 - z);
          ctx.stroke();
        }

        ctx.strokeStyle = palette.grid;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy - z, tile, tile);
      }
    }

    ctx.fillStyle = "#f0f6ff";
    ctx.font = "700 26px Trebuchet MS";
    ctx.fillText(title, origin.x, origin.y - 24);
  }

  function drawHud() {
    ctx.fillStyle = "rgba(0, 10, 20, 0.44)";
    ctx.fillRect(30, canvas.height - 94, canvas.width - 60, 64);

    ctx.fillStyle = "#e6f1ff";
    ctx.font = "600 22px Trebuchet MS";
    ctx.fillText(state.message, 44, canvas.height - 53);

    ctx.font = "600 16px Trebuchet MS";
    ctx.fillStyle = "#bcdbff";
    const left = `Your ships afloat: ${state.playerBoard ? state.playerBoard.alive : 0}`;
    const right = `Enemy ships afloat: ${state.enemyBoard ? state.enemyBoard.alive : 0}`;
    ctx.fillText(left, 46, canvas.height - 28);
    ctx.fillText(right, canvas.width - 245, canvas.height - 28);
  }

  function drawParticles(dt) {
    for (let i = state.particleBursts.length - 1; i >= 0; i -= 1) {
      const p = state.particleBursts[i];
      p.t -= dt;
      if (p.t <= 0) {
        state.particleBursts.splice(i, 1);
        continue;
      }
      const life = p.t / 0.35;
      ctx.fillStyle = p.color;
      for (let j = 0; j < 9; j += 1) {
        const angle = (Math.PI * 2 * j) / 9;
        const r = (1 - life) * 22;
        ctx.globalAlpha = life;
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(angle) * r, p.y + Math.sin(angle) * r, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawSeaBackdrop() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#1c4f7d");
    gradient.addColorStop(0.5, "#12375f");
    gradient.addColorStop(1, "#071b35");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 36; i += 1) {
      const y = (i * 37) % canvas.height;
      ctx.fillRect(0, y, canvas.width, 2);
    }
  }

  function render(dt = 0) {
    setupLayout();
    drawSeaBackdrop();

    if (state.playerBoard && state.enemyBoard) {
      drawBoard(state.playerBoard, state.layout.leftOrigin, true, "Your Fleet");
      drawBoard(state.enemyBoard, state.layout.rightOrigin, state.mode === "over", "Enemy Waters");
      drawHud();
      drawParticles(dt);

      if (state.hover && state.turn === "player" && state.mode === "play") {
        const { tile, rightOrigin } = state.layout;
        const x = rightOrigin.x + state.hover.x * tile;
        const y = rightOrigin.y + state.hover.y * tile;
        ctx.strokeStyle = "#ffe2a6";
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1, y + 1, tile - 2, tile - 2);
      }
    }

    if (state.mode === "menu") {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function canvasToCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    const { rightOrigin, tile } = state.layout;
    const localX = x - rightOrigin.x;
    const localY = y - rightOrigin.y;

    if (localX < 0 || localY < 0) return null;
    const cellX = Math.floor(localX / tile);
    const cellY = Math.floor(localY / tile);
    if (!inBounds(cellX, cellY)) return null;
    return { x: cellX, y: cellY };
  }

  canvas.addEventListener("mousemove", (ev) => {
    if (state.mode !== "play") return;
    const cell = canvasToCell(ev.clientX, ev.clientY);
    state.hover = cell;
  });

  canvas.addEventListener("click", (ev) => {
    if (state.mode !== "play") return;
    const cell = canvasToCell(ev.clientX, ev.clientY);
    if (cell) registerPlayerShot(cell.x, cell.y);
  });

  startBtn.addEventListener("click", startGame);

  window.addEventListener("keydown", (ev) => {
    if (ev.key.toLowerCase() === "r") {
      startGame();
    }

    if (ev.key.toLowerCase() === "f") {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }

    if (ev.key === "Escape" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    if (ev.key.toLowerCase() === "m" && state.mode === "over") {
      restartToMenu();
    }
  });

  function update(dt) {
    void dt;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    update(dt);
    render(dt);
    requestAnimationFrame(frame);
  }

  window.render_game_to_text = () => {
    const enemyVisibleHits = [];
    const enemyVisibleMisses = [];
    const playerHits = [];
    const playerMisses = [];

    if (state.enemyBoard) {
      for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
          if (state.enemyBoard.hits[y][x]) enemyVisibleHits.push({ x, y });
          if (state.enemyBoard.misses[y][x]) enemyVisibleMisses.push({ x, y });
        }
      }
    }

    if (state.playerBoard) {
      for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
          if (state.playerBoard.hits[y][x]) playerHits.push({ x, y });
          if (state.playerBoard.misses[y][x]) playerMisses.push({ x, y });
        }
      }
    }

    return JSON.stringify({
      mode: state.mode,
      turn: state.turn,
      message: state.message,
      board: {
        size: BOARD_SIZE,
        origin: "top-left",
        xDirection: "right",
        yDirection: "down",
      },
      fleets: {
        playerShipsAfloat: state.playerBoard ? state.playerBoard.alive : 0,
        enemyShipsAfloat: state.enemyBoard ? state.enemyBoard.alive : 0,
      },
      shots: {
        enemyBoardHits: enemyVisibleHits,
        enemyBoardMisses: enemyVisibleMisses,
        playerBoardHits: playerHits,
        playerBoardMisses: playerMisses,
      },
      hoverCell: state.hover,
      winner: state.winner,
    });
  };

  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    const dt = ms / 1000 / steps;
    for (let i = 0; i < steps; i += 1) {
      update(dt);
    }
    render(dt);
  };

  requestAnimationFrame(frame);
  render();
})();
