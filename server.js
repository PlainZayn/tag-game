const http = require("http");
const { Server, Room } = require("colyseus");
const { WebSocketTransport } = require("@colyseus/ws-transport");
const { Schema, type, ArraySchema, MapSchema } = require("@colyseus/schema");

// Game State Schema
class Player extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.isIt = false;
    this.itTime = 0;
    this.color = "#ffffff";
    this.id = "";
    this.onGround = false;
    this.jumps = 2;
    this.left = false;
    this.right = false;
    this.jump = false;
    this.down = false;
    this.tagCooldown = 0;
    this.jumpPressed = false;
  }
}

// runtime type declarations (for plain JS)
type("number")(Player.prototype, "x");
type("number")(Player.prototype, "y");
type("number")(Player.prototype, "vx");
type("number")(Player.prototype, "vy");
type("boolean")(Player.prototype, "isIt");
type("number")(Player.prototype, "itTime");
type("string")(Player.prototype, "color");
type("string")(Player.prototype, "id");
type("boolean")(Player.prototype, "onGround");
type("number")(Player.prototype, "jumps");
type("boolean")(Player.prototype, "left");
type("boolean")(Player.prototype, "right");
type("boolean")(Player.prototype, "jump");
type("boolean")(Player.prototype, "down");
type("number")(Player.prototype, "tagCooldown");
type("boolean")(Player.prototype, "jumpPressed");

class GameState extends Schema {
  constructor() {
    super();
    this.elapsed = 0;
    this.timeLimit = 90;
    this.finished = false;
    this.p1Time = 0;
    this.p2Time = 0;
    this.players = new MapSchema();
  }
}

type("number")(GameState.prototype, "elapsed");
type("number")(GameState.prototype, "timeLimit");
type("boolean")(GameState.prototype, "finished");
type("number")(GameState.prototype, "p1Time");
type("number")(GameState.prototype, "p2Time");
type({ map: Player })(GameState.prototype, "players");

class TagRoom extends Room {
  onCreate(options) {
    this.setState(new GameState());
    this.state.elapsed = 0;
    this.state.timeLimit = options.timeLimit || 90;
    this.state.finished = false;
    this.state.p1Time = 0;
    this.state.p2Time = 0;
    this.state.players = new MapSchema();

    const GRAVITY = 1800;
    const MOVE_SPEED = 360;
    const ACCEL = 2800;
    const FRICTION = 2400;
    const JUMP_SPEED = 650;
    const TAG_COOLDOWN = 0.4;
    const FAST_FALL_MULT = 2.5;

    const platforms = [
      { x: 0, y: 500, w: 960, h: 40 },
      { x: 60, y: 420, w: 200, h: 20 },
      { x: 320, y: 360, w: 160, h: 20 },
      { x: 600, y: 400, w: 200, h: 20 },
      { x: 760, y: 320, w: 180, h: 20 },
      { x: 200, y: 280, w: 160, h: 20 },
      { x: 440, y: 230, w: 120, h: 20 },
      { x: 650, y: 260, w: 160, h: 20 },
      { x: 300, y: 160, w: 180, h: 20 },
      { x: 520, y: 120, w: 160, h: 20 },
    ];

    const canvas = { width: 960, height: 540 };

    const createPlayer = (x, y, color) => {
      const p = new Player();
      p.x = x;
      p.y = y;
      p.vx = 0;
      p.vy = 0;
      p.onGround = false;
      p.jumps = 2;
      p.left = false;
      p.right = false;
      p.jump = false;
      p.down = false;
      p.color = color;
      p.isIt = false;
      p.itTime = 0;
      p.tagCooldown = 0;
      return p;
    };
    // expose helpers on `this` so lifecycle methods can access them
    this.platforms = platforms;
    this.canvas = canvas;
    this.createPlayer = createPlayer;

    const getPlayerForClient = (client) => {
      let target = null;
      this.state.players.forEach((player) => {
        if (!target && player.id === client.sessionId) {
          target = player;
        }
      });
      return target;
    };

    // Listen for client input messages per session
    this.onMessage("input", (client, message = {}) => {
      if (!this.state.players) {
        return;
      }

      const player = getPlayerForClient(client);
      if (!player) {
        return;
      }

      player.left = !!message.left;
      player.right = !!message.right;
      player.jump = !!message.jump;
      player.down = !!message.down;
    });

    this.startGame = () => {
      this.gameStarted = true;
      this.lastUpdate = Date.now();

      const updateLoop = setInterval(() => {
        if (this.state.finished || !this.gameStarted) {
          clearInterval(updateLoop);
          this.gameStarted = false;
          return;
        }

        const now = Date.now();
        const dt = (now - this.lastUpdate) / 1000;
        this.lastUpdate = now;

        if (dt > 0.05) return; // Skip if dt is too large

        const p1 = this.state.players.get("player1");
        const p2 = this.state.players.get("player2");

        if (!p1 || !p2) return;

        // Update players
        [p1, p2].forEach((p) => {
          // Jump
          if (
            p.jump &&
            p.jumps > 0 &&
            p.jumpPressed !== true
          ) {
            p.vy = -JUMP_SPEED;
            p.jumps--;
            p.jumpPressed = true;
          }
          if (!p.jump) p.jumpPressed = false;

          // Movement
          let target = 0;
          if (p.left) target -= MOVE_SPEED;
          if (p.right) target += MOVE_SPEED;

          if (p.vx < target)
            p.vx = Math.min(target, p.vx + ACCEL * dt);
          else if (p.vx > target)
            p.vx = Math.max(target, p.vx - ACCEL * dt);
          else if (!p.left && !p.right) {
            if (Math.abs(p.vx) < FRICTION * dt) p.vx = 0;
            else p.vx += (p.vx > 0 ? -1 : 1) * FRICTION * dt;
          }
          p.x += p.vx * dt;

          // Gravity
          let gravityApplied = GRAVITY;
          if (p.down && !p.onGround) gravityApplied *= FAST_FALL_MULT;
          p.vy += gravityApplied * dt;
          p.y += p.vy * dt;

          // Platform collision
          p.onGround = false;
          for (const pl of platforms) {
            if (
              p.x + 28 > pl.x &&
              p.x < pl.x + pl.w
            ) {
              if (
                p.y + 40 > pl.y &&
                p.y < pl.y + pl.h
              ) {
                if (
                  p.vy > 0 &&
                  p.y + 40 - p.vy * dt <= pl.y + 5
                ) {
                  p.y = pl.y - 40;
                  p.vy = 0;
                  p.onGround = true;
                  p.jumps = 2;
                } else if (
                  p.vy < 0 &&
                  p.y - p.vy * dt >= pl.y + pl.h - 5
                ) {
                  p.y = pl.y + pl.h;
                  p.vy = 0;
                }
              }
            }
          }

          // Bounds
          if (p.x < 0) {
            p.x = 0;
            p.vx = 0;
          }
          if (p.x + 28 > canvas.width) {
            p.x = canvas.width - 28;
            p.vx = 0;
          }
          if (p.y > canvas.height + 100) {
            p.x = Math.random() * canvas.width;
            p.y = 40;
            p.vx = 0;
            p.vy = 0;
            p.jumps = 2;
          }

          // Tag cooldown
          if (p.tagCooldown > 0) p.tagCooldown -= dt;
        });

        // Check tagging
        const rectsOverlap = (a, b) => {
          return (
            a.x < a.w + b.x &&
            a.x + a.w > b.x &&
            a.y < a.h + b.y &&
            a.y + a.h > b.y
          );
        };

        if (p1.isIt) {
          if (
            rectsOverlap(
              { x: p1.x, y: p1.y, w: 28, h: 40 },
              { x: p2.x, y: p2.y, w: 28, h: 40 }
            ) &&
            p1.tagCooldown <= 0 &&
            p2.tagCooldown <= 0
          ) {
            p1.isIt = false;
            p2.isIt = true;
            p1.tagCooldown = p2.tagCooldown = TAG_COOLDOWN;
            p1.vy = -150;
            p2.vy = -220;
          }
        }

        if (p2.isIt) {
          if (
            rectsOverlap(
              { x: p2.x, y: p2.y, w: 28, h: 40 },
              { x: p1.x, y: p1.y, w: 28, h: 40 }
            ) &&
            p2.tagCooldown <= 0 &&
            p1.tagCooldown <= 0
          ) {
            p2.isIt = false;
            p1.isIt = true;
            p2.tagCooldown = p1.tagCooldown = TAG_COOLDOWN;
            p2.vy = -150;
            p1.vy = -220;
          }
        }

        // Update timer
        this.state.elapsed += dt;
        if (p1.isIt) this.state.p1Time += dt;
        if (p2.isIt) this.state.p2Time += dt;

        // Check if finished
        if (this.state.elapsed >= this.state.timeLimit) {
          this.state.finished = true;
          this.gameStarted = false;
        }
      }, 1000 / 60); // 60 FPS
    };
  }

  onJoin(client, options) {
    console.log(`Client ${client.sessionId} joined`);

    if (this.clients.length === 1) {
      const p1 = this.createPlayer(140, 420, options.p1Color || "#9b59b6");
      p1.id = client.sessionId;
      p1.isIt = true;
      this.state.players.set("player1", p1);
      this.p1Client = client;
    } else if (this.clients.length === 2) {
      const p2 = this.createPlayer(760, 420, options.p2Color || "#f1c40f");
      p2.id = client.sessionId;
      p2.isIt = false;
      this.state.players.set("player2", p2);
      this.p2Client = client;

      // Start game when both players join
      this.startGame();
    }
  }

  onLeave(client) {
    console.log(`Client ${client.sessionId} left`);
    if (this.p1Client && client.sessionId === this.p1Client.sessionId) {
      this.state.players.delete("player1");
      this.p1Client = null;
    } else if (this.p2Client && client.sessionId === this.p2Client.sessionId) {
      this.state.players.delete("player2");
      this.p2Client = null;
    }
  }

  onDispose() {
    console.log("Room disposed");
  }
}

// create an HTTP server and attach WebSocket transport to it
const httpServer = http.createServer();

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("tag_game", TagRoom);

const PORT = process.env.PORT || 2567;

// Normalize CORS responses so browser credentials work during local dev
const allowedOriginsRaw = process.env.CORS_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || 'http://localhost:8080';
const allowedOrigins = allowedOriginsRaw
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAllOrigins = allowedOrigins.includes('*');
const fallbackOrigin = allowedOrigins.find((origin) => origin !== '*') || 'http://localhost:8080';
const corsAllowMethods = process.env.CORS_ALLOW_METHODS || 'GET,POST,PUT,DELETE,OPTIONS';
const corsAllowHeaders = process.env.CORS_ALLOW_HEADERS || 'Content-Type, Authorization, X-Requested-With';

const pickOrigin = (requestOrigin) => {
  if (!requestOrigin) {
    return fallbackOrigin;
  }
  if (allowAllOrigins || allowedOrigins.length === 0) {
    return requestOrigin;
  }
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : fallbackOrigin;
};

httpServer.prependListener('request', (req, res) => {
  const requestOrigin = req.headers.origin;
  const origin = pickOrigin(requestOrigin);

  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = function (name, value) {
    if (!name) {
      return originalSetHeader(name, value);
    }

    const key = typeof name === 'string' ? name.toLowerCase() : name;
    if (key === 'access-control-allow-origin') {
      const nextValue = value && value !== '*' ? value : origin;
      return originalSetHeader(name, nextValue);
    }
    if (key === 'access-control-allow-credentials') {
      return originalSetHeader(name, 'true');
    }
    if (key === 'vary') {
      const varyValue = Array.isArray(value) ? value.join(',') : String(value || '');
      if (!varyValue.toLowerCase().split(',').map((v) => v.trim()).includes('origin')) {
        return originalSetHeader(name, `${varyValue ? `${varyValue}, ` : ''}Origin`);
      }
    }

    return originalSetHeader(name, value);
  };

  const ensureCorsHeaders = () => {
    if (!res.getHeader('Access-Control-Allow-Origin')) {
      originalSetHeader('Access-Control-Allow-Origin', origin);
    }
    if (!res.getHeader('Access-Control-Allow-Credentials')) {
      originalSetHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (!res.getHeader('Access-Control-Allow-Methods')) {
      originalSetHeader('Access-Control-Allow-Methods', corsAllowMethods);
    }
    if (!res.getHeader('Access-Control-Allow-Headers')) {
      originalSetHeader('Access-Control-Allow-Headers', corsAllowHeaders);
    }
    const varyHeader = res.getHeader('Vary');
    if (!varyHeader) {
      originalSetHeader('Vary', 'Origin');
    }
  };

  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = function (statusCode, statusMessage, headers) {
    let msg = statusMessage;
    let hdrs = headers;

    if (typeof msg === 'object' && hdrs === undefined) {
      hdrs = msg;
      msg = undefined;
    }

    if (hdrs) {
      Object.keys(hdrs).forEach((headerName) => {
        const lower = headerName.toLowerCase();
        if (lower === 'access-control-allow-origin' && hdrs[headerName] === '*') {
          hdrs[headerName] = origin;
        }
        if (lower === 'access-control-allow-credentials') {
          hdrs[headerName] = 'true';
        }
        if (lower === 'vary') {
          const varyValue = String(hdrs[headerName] || '');
          if (!varyValue.toLowerCase().split(',').map((v) => v.trim()).includes('origin')) {
            hdrs[headerName] = `${varyValue ? `${varyValue}, ` : ''}Origin`;
          }
        }
      });
    }

    ensureCorsHeaders();

    if (msg !== undefined && hdrs !== undefined) {
      return originalWriteHead.call(this, statusCode, msg, hdrs);
    }
    if (hdrs !== undefined) {
      return originalWriteHead.call(this, statusCode, hdrs);
    }
    if (msg !== undefined) {
      return originalWriteHead.call(this, statusCode, msg);
    }
    return originalWriteHead.call(this, statusCode);
  };

  ensureCorsHeaders();

  if (requestOrigin) {
    console.log(`[HTTP] ${req.method} ${req.url} from ${requestOrigin}`);
  } else {
    console.log(`[HTTP] ${req.method} ${req.url} (no origin header)`);
  }
});

httpServer.listen(PORT, () => {
  console.log(`Colyseus server running on ws://localhost:${PORT}`);
});
