# Progressive Tracker 💪

A premium, modern web application designed to help you track your strength training progress with precision and visual clarity. Focus on the core principle of **Progressive Overload** and watch your gains grow.

![Banner](https://img.shields.io/badge/Status-Active-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue) ![Technology](https://img.shields.io/badge/Stack-Vanilla%20JS--Chart.js-orange)

## 🚀 Key Features

### 📝 Effortless Workout Logging
- **Quick Entry**: Log your sets, reps, and weight in seconds.
- **Planned Sessions**: Preload a full session and submit all planned sets in one go.
- **Superset Blocks**: Plan supersets (A/B/C exercises in sequence) and log them as one batch.
- **Muscle-First Filtering**: Quickly find exercises by targeting specific muscle groups.
- **Smart Suggestions**: Get real-time suggestions based on your previous performance to ensure you're always progressing.
- **Dynamic Equipment Support**: Tailored fields for Barbell, Dumbbell, Kettlebell, Machines, and Bodyweight exercises.

### 📊 Powerful Analytics & Visualization
- **Performance Dashboards**: View your weekly activity broken down by muscle group.
- **Progress Trends**: Visualize your strength gains with interactive charts (Powered by Chart.js).
- **Personal Records (PRs)**: Automatically tracks and highlights your best lifts.
- **Progress Milestones**: celebrate your achievements with a built-in milestone system (Streaks, Best Lifts, Consistent Progress).

### 💾 Dual-Mode Storage Persistence
- **Local Mode**: Fast and private storage directly in your browser's `localStorage`.
- **GitHub Mode**: Sync your data across devices by using a private GitHub repository as your database via the GitHub API.
- **Seamless Migration**: Switch between modes easily via the configuration menu.

### 🍱 Premium UI/UX
- **Modern Design**: A clean, "glassmorphism" inspired interface with a curated color palette.
- **Interactive Elements**: Smooth transitions, hover effects, and micro-animations.
- **Responsive Layout**: Designed to look stunning on both desktop and mobile devices.
- **Lucide Icons**: Crisp, professional iconography throughout the app.

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Charts**: [Chart.js](https://www.chartjs.org/) for high-performance data visualization.
- **Icons**: [Lucide Icons](https://lucide.dev/) for beautiful, consistent iconography.
- **Persistence**: GitHub REST API & Browser LocalStorage.
- **Dev Environment**: Simple Node.js server for local development.

---

## 🏁 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (optional, for local dev server)
- A modern web browser.

### Local Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/MinoPlay/ProgressiveOverload.git
   cd ProgressiveOverload
   ```
2. Start the development server:
   ```bash
   node server.js
   ```
   *Or use the provided PowerShell helper:*
   ```powershell
   .\dev-start.ps1
   ```
3. Open `http://localhost:3000` in your browser.

### Configuring GitHub Mode (Sync)
1. In the app, go to **Menu > Configuration**.
2. Switch to **GitHub** mode.
3. Enter your:
   - **GitHub Token**: Generate a Personal Access Token (PAT) with `repo` scope.
   - **GitHub Username**: Your username.
   - **Repository Name**: The name of the repository to store data in.
4. Click **Save**. The app will now sync your progress to your repository!

---

## 🏗️ Project Structure

- `index.html`: Main application entry point.
- `css/`: Styling organized by layout and components.
- `js/`: Modular JavaScript logic (storage, charts, UI, API).
- `data/`: Local development data and schemas.
- `assets/`: Icons and static assets.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Keep pumping and stay progressive!* 🏋️‍♂️
