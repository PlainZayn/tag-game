const http = require("http");
const { Server } = require("colyseus");
const { WebSocketTransport } = require("@colyseus/ws-transport");
const { Schema, type, ArraySchema, MapSchema } = require("@colyseus/schema");

// Game State Schema
class Player extends Schema {
  @type("number") x;
  @type("number") y;
  @type("number") vx;
  @type("number") vy;
  @type("boolean") isIt;
  @type("number") itTime;
  @type("string") color;
  @type("string") id;
  @type("boolean") onGround;
  @type("number") jumps;
  @type("boolean") left;
  @type("boolean") right;
  @type("boolean") jump;
  @type("boolean") down;
  @type("number") tagCooldown;
}

class GameState extends Schema {
  @type("number") elapsed;
  @type("number") timeLimit;
  @type("boolean") finished;
  @type("number") p1Time;
  @type("number") p2Time;
  @type(MapSchema(Player)) players;
}

class TagRoom extends Server.Room {
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

    this.on("join", (client, options) => {
      console.log(`Client ${client.sessionId} joined`);

      if (this.clients.length === 1) {
        const p1 = createPlayer(140, 420, options.p1Color || "#9b59b6");
        p1.id = client.sessionId;
        p1.isIt = true;
        this.state.players.set("player1", p1);
        this.p1Client = client;
      } else if (this.clients.length === 2) {
        const p2 = createPlayer(760, 420, options.p2Color || "#f1c40f");
        p2.id = client.sessionId;
        p2.isIt = false;
        this.state.players.set("player2", p2);
        this.p2Client = client;

        // Start game when both players join
        this.startGame();
      }
    });

    this.on("leave", (client) => {
      console.log(`Client ${client.sessionId} left`);
      if (client === this.p1Client) {
        this.state.players.delete("player1");
      } else if (client === this.p2Client) {
        this.state.players.delete("player2");
      }
    });

    this.on("message", (client, message) => {
      if (message.type === "input" && this.state.players) {
        const playerKey = client === this.p1Client ? "player1" : "player2";
        const player = this.state.players.get(playerKey);
        if (player) {
          player.left = message.left || false;
          player.right = message.right || false;
          player.jump = message.jump || false;
          player.down = message.down || false;
        }
      }
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

  onDispose() {
    console.log("Room disposed");
  }
}

const gameServer = new Server({
  transport: new WebSocketTransport({ port: 2567 }),
});

gameServer.define("tag_game", TagRoom);

console.log("Colyseus server running on ws://localhost:2567");
