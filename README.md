# World Cup 

A React app to track your World Cup predictions vs. actual results.

## Features
- 12 groups of 4 teams (48 teams total)
- Click teams to assign 1st / 2nd / best-3rd place qualifiers
- Full knockout bracket: R32 → R16 → QF → SF → Final + 3rd place playoff
- Two independent tabs: My Prediction and Actual Results

## Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or later)
- npm (comes with Node.js)

### Steps

1. **Open the project folder in VS Code**
   ```
   File → Open Folder → select the `WorldCup` folder
   ```

2. **Open the integrated terminal**
   ```
   Terminal → New Terminal  (or Ctrl+` / Cmd+`)
   ```

3. **Install dependencies**
   ```
   npm install
   ```

4. **Start the dev server**
   ```
   npm start
   ```
   The app will open at `http://localhost:3000` automatically.

## How to use

### Group Stage
- Click a team **once** → 1st place (dark blue)
- Click **twice** → 2nd place (mid blue)
- Click **three times** → best 3rd place ⭐ (gold)
- Click again → deselect
- Once all 12 groups have top 2 selected, and 8 best-3rd teams are chosen, click **Build knockout bracket**

### Knockout Stage
- Click a team in any match to advance them to the next round
- SF losers are automatically placed in the 3rd place playoff
- Pick the Final winner to crown the champion

### Tabs
- 🔮 **My Prediction** and 📺 **Actual Results** are fully independent — fill both in and compare!
