# Multiplayer Tag Game

A real-time multiplayer tag game built with Colyseus and Canvas.

## Setup & Installation

### Prerequisites
- Node.js 14+ installed
- npm or yarn

### Server Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

The server will run on `ws://localhost:2567`

For development with auto-reload:
```bash
npm run dev
```

### Client Setup

1. Open `Index.html` in a web browser (or serve with a local HTTP server)
2. The game will automatically connect to the server at `ws://localhost:2567`

### Playing Locally

1. Open two browser windows (or tabs)
2. Click "Start Match" in both windows
3. First player uses **A/D** to move, **W** to jump, **S** to fast fall
4. Second player uses **Arrow Keys** to move, **↑** to jump, **↓** to fast fall
5. Press **R** to return to menu

## Game Rules

- Players take turns being "it"
- When "it", try to tag the other player
- When tagged, you become "it"
- Score is how long each player avoids being "it"
- Winner has the least time as "it"

## Deploying to GitHub Pages

To deploy to GitHub Pages, you need a hosted Colyseus server (GitHub Pages only hosts static files).

### Option 1: Use a Free Hosting Service

Deploy the `server.js` to Heroku, Glitch, or Railway:

**For Railway:**
1. Push code to GitHub
2. Connect to Railway: https://railway.app
3. Update the WebSocket URL in `Index.html`:
```javascript
const client = new Colyseus.Client("wss://your-railway-url.railway.app");
```

**For Glitch:**
1. Create a new project on Glitch
2. Upload `server.js`, `package.json`
3. Get your Glitch URL and update the WebSocket connection

### Option 2: Use a Managed Service

Consider using **Playroom.gg** or **PlayFab** for backend hosting.

## Architecture

- **Client**: Canvas-based 2D game rendered in browser
- **Server**: Colyseus room-based server handling game state sync
- **Network**: WebSocket for real-time communication
- **Sync**: Automatic state updates pushed to all clients every frame

## Project Structure

```
├── Index.html       # Game client
├── server.js        # Colyseus server
├── package.json     # Node dependencies
└── README.md        # This file
```
