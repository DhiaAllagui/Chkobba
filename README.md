# 🃏 Chkobba — The Essential Tunisian Card Game

Welcome to the definitive digital version of **Chkobba** (*الشكبة*), the most beloved traditional card game of Tunisia. Play against a sophisticated AI or challenge real opponents worldwide in a high-stakes ranked environment.

![Chkobba Logo](/img/chkobbalogo.png)

---

## 💎 Features

### 🏛️ Classic & Modern Gameplay
*   **Solo Mode:** Practice against **Hamdi (Medium)**, **M3allem (Hard)**, or the legendary **Lpatron (Expert)** AI.
*   **Multiplayer Rooms:** Create a private room and share a 4-digit code with a friend to play instantly.
*   **Ranked Queue:** Join the matchmaking pool to play against random opponents and climb the global ladder.
*   **Rulesets:** Choose between **Classic (21 Points)** for a deep strategy game or **Blitz (11 Points)** for a quick session.

### 🏆 Ranked & Analytics
*   **Global Leaderboard:** Track your standing among the top-tier players worldwide.
*   **Detailed Match History:** Review your past wins and losses, including total scores and Chkobba counts.
*   **Win Streaks:** Earn prestige badges (🔥) for maintaining consecutive victory streaks.
*   **ELO System:** A balanced rating system to ensure you're always matched against players of your skill level.

### 🎨 Immersive Aesthetics
*   **Premium Glassmorphism:** A stunning modern UI with frosted glass effects and gold accents.
*   **Café Ambience:** Relax with authentic background sounds and a built-in Tunisian radio widget.
*   **Internationalization:** Fully localized in **English**, **French**, and **Tunisian Darja (Arabic)**.

---

## 🛠️ Technology Stack

*   **Backend:** Node.js & Express.js
*   **Real-time:** Socket.io (WebSocket) for low-latency multiplayer.
*   **Database & Auth:** Supabase (PostgreSQL) for persistent profiles, history, and leaderboards.
*   **Frontend:** Vanilla JS, HTML5, and CSS3 (No heavy frameworks for maximum performance).

---

## 🚀 Getting Started

### 1. Installation
Clone the repository and install the dependencies:
```bash
git clone https://github.com/DhiaAllagui/chkobba.git
cd chkobba
npm install
```

### 2. Configuration
Create a `.env` file in the root directory and add your Supabase credentials:
```env
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_public_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_secret_admin_key
PORT=3000
```

### 3. Database Setup
Run the SQL queries found in [supabase-schema.sql](supabase-schema.sql) directly inside your **Supabase SQL Editor** to initialize the required tables and security policies.

### 4. Running Locally
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## ☁️ Deployment

This project is optimized for deployment on **Render.com**:
1.  Connect your GitHub repository.
2.  Set the **Build Command** to `npm install`.
3.  Set the **Start Command** to `node server.js`.
4.  Add the environment variables mentioned above in the **Environment** tab.

---

## 📜 License & Credits

Developed with ❤️ by **Med Dhia Allagui**.  
All rights reserved. 2024.

---

> *"Adhika l'7ayya!"* — **The Chkobba Pro**
