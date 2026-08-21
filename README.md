# Google Home Professional Assessment

A server-graded assessment with a bilingual Persian/English interface and English-only questions for Google Home, Google/Nest products, smart appliances, Matter, Thread, networking, security, automation, and troubleshooting.

## What is included

- Static frontend suitable for GitHub Pages
- 60 questions per attempt, 75-minute server timer
- One random variant from each of 60 learning objectives
- Private 300-question English-only bank supplied separately
- Email/password authentication through Supabase Auth
- Server-side question delivery, answer saving, scoring, section thresholds, and cooldown
- Tab/focus/network event logging
- Persian/English interface switch, English-only question/option text, and responsive mobile layout

## Security boundary

The public repository does **not** contain the production answer bank. Keep the separately supplied `private-bank` package offline and import it into Supabase. Never commit a service-role key or the private bank.

## 1. Create Supabase project

Create a project, then install the Supabase CLI and sign in:

```bash
npm install supabase --save-dev
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

## 2. Apply the database schema

From the repository root:

```bash
npx supabase db push
```

## 3. Deploy Edge Functions

```bash
npx supabase functions deploy start-exam
npx supabase functions deploy resume-exam
npx supabase functions deploy save-answer
npx supabase functions deploy submit-exam
npx supabase functions deploy log-event
```

Restrict browser calls to your final site URL:

```bash
npx supabase secrets set ALLOWED_ORIGIN="https://YOUR_USERNAME.github.io/YOUR_REPOSITORY"
```

The server-side Supabase variables are provided automatically to hosted Edge Functions. Never put the service-role key in `site/config.js`.

## 4. Import the private bank

Use the separate private package:

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SECRET_KEY="sb_secret_..."
cd private-bank
node import-bank.mjs question-bank.json
```

Do this locally. Do not copy the private package into the public repository.

## 5. Configure authentication

In Supabase Authentication settings:

- Set the Site URL to the GitHub Pages URL.
- Add the same URL to Redirect URLs.
- Choose whether email confirmation is required.
- For testing, create at least one account and confirm it.

## 6. Publish to GitHub Pages

Create an empty GitHub repository and push this folder:

```bash
git init
git add .
git commit -m "Initial secure exam site"
git branch -M main
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

In repository settings:

1. Open **Settings > Pages**.
2. Set **Source** to **GitHub Actions**.
3. Add repository variable `SUPABASE_URL`.
4. Add repository secret `SUPABASE_PUBLISHABLE_KEY`.
5. Run the `Deploy exam to GitHub Pages` workflow or push to `main`.

The publishable key is designed for browser use when RLS is configured. The service-role key must remain private.

## Passing rules

- Overall: 80%
- Security: 70% minimum
- Networking: 60% minimum
- Google/Nest products: 60% minimum
- Retake cooldown: 24 hours

## Local preview

The committed `site/config.js` starts in demo mode:

```bash
cd site
python3 -m http.server 8080
```

Open `http://localhost:8080`. Demo questions are English-only, illustrative and are not part of the private production bank.


## v3.4 Behavioral integrity monitoring

The assessment now records server-assisted answer timing and question-view events, detects implausibly fast answering patterns, dense answer bursts, answers submitted without a recorded question view, background answers, excessive answer changes, rapid navigation, and unusually fast high-score completion. These signals trigger integrity review rather than being treated as conclusive proof of misconduct.
