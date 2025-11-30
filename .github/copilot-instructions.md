# Tag Game AI Instructions

## Project Overview
This is a real-time multiplayer tag game using **Node.js + Colyseus** (backend) and **Vanilla HTML/JS** (frontend).
- **Architecture**: Server-authoritative physics and state. The server calculates movement, collisions, and game rules. The client sends inputs and renders the state.
- **Communication**: WebSockets via Colyseus framework.

## Key Files & Structure
- `server.js`: **Monolithic server file**. Contains:
  - `Player` & `GameState` schemas (Colyseus state definitions).
  - `TagRoom` class (Game logic, physics loop, input handling).
  - HTTP/WebSocket server setup with manual CORS handling.
- `Index.html`: **Monolithic client file**. Contains:
  - Game UI (HTML/CSS).
  - Client logic (Colyseus connection, input capture, rendering loop).
  - **Note**: Physics constants (`GRAVITY`, `MOVE_SPEED`, etc.) are currently **duplicated** in both `server.js` and `Index.html`. Ensure updates are applied to both.

## Development Workflow
1. **Server**: Run `npm run dev` (uses `nodemon` for auto-restart).
   - Port: `2567` (WebSocket).
2. **Client**: Open `Index.html` directly in a browser or use `npm run serve`.
   - Connects to `ws://localhost:2567` by default.
   - **Testing**: Open two browser tabs to simulate P1 and P2.

## Code Patterns & Conventions

### Server-Side (`server.js`)
- **State Management**: Use `Schema`, `MapSchema`, `type` from `@colyseus/schema`.
  - `this.state.players` (MapSchema) holds all player data.
- **Game Loop**: `TagRoom` runs a 60FPS interval (`setInterval`) for physics.
  - **Physics**: Custom AABB collision detection against static `platforms` array.
  - **Inputs**: Clients send `{ left, right, jump, down }`. Server applies these to velocity/position.
- **Player Assignment**:
  - 1st connection -> `player1` (P1).
  - 2nd connection -> `player2` (P2).

### Client-Side (`Index.html`)
- **Input Mapping**:
  - **P1**: WASD keys.
  - **P2**: Arrow keys.
  - *Crucial*: The client logic (`handleKey`) enforces this mapping based on `myPlayerNumber`.
- **Rendering**: `requestAnimationFrame` loop clears and redraws canvas based on `room.state`.
- **Interpolation**: Currently minimal. Client renders `player.x/y` directly from state updates.

## Common Tasks
- **Adding a Platform**: Update the `platforms` array in **BOTH** `server.js` and `Index.html`.
- **Tweak Physics**: Update constants (`GRAVITY`, `JUMP_SPEED`) in **BOTH** files.
- **New Game State**:
  1. Add field to `GameState` or `Player` class in `server.js`.
  2. Add `type(...)` decorator in `server.js`.
  3. Access via `room.state` in `Index.html`.
