# GitHub / Vercel publishing checklist

## 1) Create GitHub repository

Create an empty repository on GitHub, for example:

`amin-building-manager`

## 2) Push this project

From the project folder:

```bash
git init
git branch -M main
git add .
git commit -m "Initial professional Amin Building Manager"
git remote add origin https://github.com/YOUR_USERNAME/amin-building-manager.git
git push -u origin main
```

## 3) Run locally first

```bash
npm install
npm start
```

Open:

`http://localhost:3000`

## 4) Important SQLite note

The production data file is `db/amin.db` and is intentionally ignored by Git.

Back it up separately.

Do NOT use a writable local SQLite file as the production database on Vercel.

## 5) Vercel

The repo contains `vercel.json` and `api/index.js`, but a persistent hosted database must be connected before treating the deployment as the real accounting system.

For a hosted SQLite-compatible option, use Turso/libSQL. Another production option is PostgreSQL on a persistent database provider.
