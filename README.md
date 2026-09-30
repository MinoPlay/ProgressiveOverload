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

### 💾 Supabase Storage
- **Multi-user Persistence**: Supabase Postgres with email magic-link authentication and row-level security.
- **Automated Migration**: GitHub-to-Supabase reconciliation tooling for legacy data and deterministic Supabase-to-GitHub backups.

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
- **Persistence**: Supabase Postgres/Auth.
- **Dev Environment**: Simple Node.js server for local development.

---

## 🏁 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 22+
- A modern web browser.

### Local Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/MinoPlay/ProgressiveOverload.git
   cd ProgressiveOverload
   ```
2. Enable the git hooks (auto-bumps PWA version on each commit):
   ```bash
   git config core.hooksPath .githooks
   ```
3. Install migration tooling:
   ```bash
   npm ci
   ```
4. Start the development server:
   ```bash
   node server.js
   ```
   *Or use the provided PowerShell helper:*
   ```powershell
   .\dev-start.ps1
   ```
5. Open the URL printed by the development server.

### Configuring Supabase

Before running the automation:

1. Install and authenticate the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and [GitHub CLI](https://cli.github.com/).
2. Create or sign in the legacy owner through Supabase Auth and copy its user UUID.
3. Copy the project's service-role key and database password into the current PowerShell session. Never put either value in browser code or pass them as command-line arguments.

```powershell
$securePassword = Read-Host 'Supabase database password' -AsSecureString
$env:SUPABASE_DB_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
$env:SUPABASE_SERVICE_ROLE_KEY = '<service-role-key>'
npm run migration:help
npm run migration:setup -- `
  --project-ref clkhiheomufzytfxrezn `
  --supabase-url https://clkhiheomufzytfxrezn.supabase.co `
  --legacy-user-id '<auth-user-uuid>'
```

This links the project, applies migrations, and configures all required GitHub Actions secrets and variables. Use `--dry-run` to print a redacted plan without making changes. Repository, data path, source ref, and backup branch can be overridden; run `npm run migration:help` for all parameters.

If the current network blocks PostgreSQL ports `5432` and `6543`, apply the migration file through the Supabase SQL Editor, record version `20260928102600` in `supabase_migrations.schema_migrations`, then rerun setup with `--skip-db-push`.

After setup, two dashboard actions remain manual:

1. Add `progressive_overload` under **Supabase → Data API → Exposed schemas**.
2. Add the production and local URLs under **Supabase Auth → URL Configuration**.

Push the migration files and workflows, then trigger the validation-only reconciliation:

```powershell
npm run migration:dispatch -- --dry-run
```

Review the workflow report, then run the real reconciliation:

```powershell
npm run migration:dispatch
```

GitHub remains authoritative and the workflow continues daily until cutover.

### Cutover and Backup

Before cutover, verify the legacy account in Supabase mode and pause all GitHub writes. Set the four variables needed by the local final reconciliation, then run:

```powershell
$env:SUPABASE_URL = 'https://clkhiheomufzytfxrezn.supabase.co'
$securePassword = Read-Host 'Supabase database password' -AsSecureString
$env:SUPABASE_DB_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
$env:SUPABASE_SERVICE_ROLE_KEY = '<service-role-key>'
$env:SUPABASE_LEGACY_USER_ID = '<auth-user-uuid>'
$env:GITHUB_TOKEN = '<token-with-source-repository-read-access>'
npm run migration:cutover -- --confirm-writes-paused --confirm-supabase-verified
```

The command performs the final GitHub-to-Supabase reconciliation and sets `SUPABASE_CUTOVER=true` only if it succeeds. Then create the first reverse backup:

```powershell
npm run migration:backup
```

Do not run scheduled forward synchronization after Supabase receives new writes. For rollback, export Supabase first and review the backup branch before restoring data outside the app.

---

## 🏗️ Project Structure

- `index.html`: Main application entry point.
- `css/`: Styling organized by layout and components.
- `js/`: Modular JavaScript logic (storage, charts, UI, API).
- `supabase/`: Versioned database schema, RLS policies, and local CLI configuration.
- `scripts/`: Forward reconciliation and reverse backup commands.
- `.github/workflows/`: Scheduled migration and backup automation.
- `progressive-overload/`: Local development data and schemas.
- `assets/`: Icons and static assets.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Keep pumping and stay progressive!* 🏋️‍♂️
