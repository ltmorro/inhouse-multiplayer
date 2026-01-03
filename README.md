# In-House Multiplayer Party Game

A real-time multiplayer party game system using a Flask backend and Astro frontend.

## Architecture

- **Backend:** Flask + Socket.IO (Python)
- **Frontend:** Astro + Vanilla JS (Static Build)
- **Communication:** WebSockets (Socket.IO)

## Setup & Running

### 1. Prerequisites
- Node.js (v18+)
- Python (v3.10+)

### 2. Installation

**Frontend:**
```bash
npm install
```

**Backend:**
```bash
# Using pip
pip install -r requirements.txt # (If generated)
# OR using uv
uv sync
```

### 3. Development

To build the frontend for production (required for Flask to serve it):
```bash
npm run build
```
This generates the `dist/` directory containing HTML and static assets.

To run the backend server:
```bash
python app.py
```
The server will start at `http://0.0.0.0:13370`.

- **Mobile Controller:** `http://<ip>:13370/mobile`
- **TV Display:** `http://<ip>:13370/tv`
- **Admin Dashboard:** `http://<ip>:13370/admin`

### 4. Working with Astro

To develop the frontend with hot-reloading (note: this won't connect to the Flask backend Socket.IO unless configured):
```bash
npm run dev
```

For full integration testing, rebuild the frontend and run `app.py`.
