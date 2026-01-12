# The "Hold My Hand" Guide to OSLSR Development

**Date:** 2026-01-06
**Purpose:** To de-mystify the current project state, explain "magic" files, and provide a clear roadmap for what you need to install and why.

---

## 1. The "What Did We Just Do?" Summary

We have successfully set up the **Foundation** (Story 1.2) for the Oyo State Labour & Skills Registry. Here is the reality of your current folder:

1.  **Monorepo Scaffolded**: You have a folder that contains *both* the frontend (`apps/web`) and backend (`apps/api`) code in one place.
2.  **Database Configured (Code-Only)**: We wrote the code to define what your database *looks like* (Users, Roles, LGAs), but we haven't successfully "pushed" this to a real database yet because Docker isn't running.
3.  **Security Rules Added**: We added code (`rbac.ts`) that says "Only Supervisors can see their own LGA".
4.  **Git Initialized**: We turned this folder into a Git repository, but we haven't saved our first "snapshot" (commit) yet because Git doesn't know your email address.

---

## 2. Immediate Actions You Need to Take

You are currently "blocked" on two things. Please do these manually on your computer:

### A. Install Docker Desktop (CRITICAL)
You asked: *"Do I need to download and install docker and postgre from the internet?"*

*   **Docker Desktop:** **YES.** You must download and install **Docker Desktop for Windows**.
    *   *Why?* Without it, we cannot run the database. The `docker` command I tried to run failed because it's not installed.
*   **PostgreSQL:** **NO.** Do **NOT** install PostgreSQL manually.
    *   *Why?* Once Docker is installed, we will run a command (`docker compose up`), and Docker will automatically download a "container" (a virtual mini-computer) that has PostgreSQL pre-installed and configured exactly how we need it. This keeps your main Windows computer clean.

### B. Configure Git Identity
You mentioned setting this up yourself. Please run these commands in your terminal (PowerShell or Git Bash) so we can save our work:

```powershell
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

---

## 3. Explaining the "Magic" Files & Folders

You asked about specific folders and file indicators.

### 🟢 What do the Icons Mean? (VS Code / Editor)
*   **`A` (Added):** This file is new and has been "staged" (ready to be saved). It's waiting for that `git commit` command.
*   **Green Dot / `U` (Untracked):** This file is new but Git hasn't been told to watch it yet.
*   **Why `.claude` was added:** The warnings you saw were just Git saying "I'm changing line endings from Windows style (CRLF) to Linux style (LF)." This is normal and good.

### 📂 Folder Breakdown
*   **`.claude`, `.codex`, `.gemini`**: These folders contain the **AI Agent's Brain**.
    *   *Why include them?* They contain the "prompts" and "instructions" that allow the AI (me) to understand your project. If you push these to GitHub, another developer can pull them down and their AI assistant will instantly understand the project too. They do **not** contain secrets.
*   **`_bmad`**: The configuration for the BMAD AI framework. It defines the workflows (like "create-story").
*   **`_bmad-output`**: This is our **Project Knowledge Base**.
    *   It contains the PRD, Architecture, and Story files.
    *   *Why include it?* It serves as the documentation for your entire project. If you hire a human developer later, they read this folder to understand what to build.
*   **`apps/api`**: The Backend (Node.js).
*   **`apps/web`**: The Frontend (React).
*   **`docker`**: Contains the recipes (`docker-compose.yml`) for spinning up your database and Redis.

### 📄 The `.env` File (Environment Variables)
*   **What is it?** A file containing "secrets" and configuration like Database Passwords and API Keys.
*   **Rule:** NEVER push `.env` to GitHub. It is in `.gitignore`.
*   **Practice:** We push `.env.example` (fake values) so developers know what keys they need, but they must create their own `.env` file with real values.

---

## 4. GitHub vs. Production (The "Two Pathways")

You were confused about "Pushing to GitHub" vs "Pushing to Production".

**Think of it like this:**

1.  **GitHub (The Library):**
    *   This is where you store your **Code**.
    *   You push here to save your work and share it with others.
    *   *Action:* `git push origin main`

2.  **Production / Hetzner VPS (The Factory):**
    *   This is where your **App actually runs** for real users.
    *   **The "Pipeline" (GitHub Actions):** This is a robot that lives inside GitHub.
        *   When you push code to GitHub (Library), the Robot wakes up.
        *   It grabs your code.
        *   It tests it.
        *   It logs into your Hetzner VPS (Factory).
        *   It updates the running app with your new code.

**In summary:** You *only* push to GitHub. The "GitHub Action" (the `.github/workflows/ci-cd.yml` file) automatically handles the push to Production/Hetzner for you. You don't need to manually copy files to the server.

---

## 5. Next Steps Roadmap

1.  **You:** Install Docker Desktop and restart your terminal.
2.  **You:** Run the git config commands.
3.  **Me (Agent):** I will run `docker compose up` to start your database.
4.  **Me (Agent):** I will run the "migrations" (applying the Schema code to that running database).
5.  **Me (Agent):** I will verify everything works.

Once Docker is installed, the scary "connection refused" errors will disappear because there will finally be a database listening on the other end!
