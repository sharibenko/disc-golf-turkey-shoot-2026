# Disc Golf Turkey Shoot

A live signup, scoring, ace-pot, and three-division leaderboard for a disc golf Turkey Shoot.

The site is a static Next.js export hosted by GitHub Pages. Shared event data is stored in Google Sheets through a Google Apps Script web app; no Firebase project or browser database is required.

## Architecture

- **GitHub Pages:** serves the scoring desk and `/display` leaderboard.
- **Google Apps Script:** validates the event admin PIN, serializes writes, and exposes the event API.
- **Google Sheets:** stores the event snapshot plus readable Event, Participants, and Throws tabs.
- **Browser session storage:** remembers only the admin PIN for the current tab session. It is not an event-data store.

The API uses an event revision number to reject stale writes when two scoring devices submit at the same time.

## 1. Create the Google Sheet backend

1. Create a blank Google Sheet.
2. Copy the spreadsheet ID from its URL (the text between `/d/` and `/edit`).
3. In the Sheet, open **Extensions → Apps Script**.
4. Replace the editor contents with [`google-apps-script/Code.gs`](google-apps-script/Code.gs). The optional [`appsscript.json`](google-apps-script/appsscript.json) records the project settings used by the repository.
5. In Apps Script, open **Project Settings → Script Properties** and add:
   - `SPREADSHEET_ID`: the ID copied in step 2
   - `ADMIN_PIN`: a private PIN used by event staff
6. Run `setupTurkeyShoot` once in the Apps Script editor and approve the requested spreadsheet access.
7. Choose **Deploy → New deployment → Web app**.
8. Set **Execute as** to yourself and allow access to anyone who should be able to load the public leaderboard. Deploy it.
9. Copy the deployment URL ending in `/exec`.

Do not put the admin PIN in GitHub, the Pages workflow, or any `NEXT_PUBLIC_` variable. Staff enter it in the scoring desk when they make the first change in a browser session.

## 2. Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Edit `.env.local` so `NEXT_PUBLIC_SHEETS_API_URL` is the Apps Script `/exec` URL.

Useful commands:

- `npm run dev`: run the local site
- `npm run build`: create the static site in `out/`
- `npm test`: build and verify both exported routes and the Sheets client

## 3. Publish with GitHub Pages

1. Push this project to a GitHub repository whose default branch is `main`.
2. In **Repository Settings → Secrets and variables → Actions → Variables**, create `SHEETS_API_URL` with the Apps Script `/exec` URL.
3. In **Repository Settings → Pages**, choose **GitHub Actions** as the source.
4. Push to `main`, or run the **Deploy to GitHub Pages** workflow manually.

The workflow in [`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds the static export with the correct repository subpath and deploys `out/` to Pages.

## Event behavior

- Signup adds $2 to the rolling ace pot.
- Each participant records ten throws.
- Circle hits score by distance; misses score zero; an ace awards the current pot.
- The leaderboard polls the Sheet-backed API and divides active scorers into balanced thirds.
- CSV export remains a local download of the current shared state.
- Reset and all scoring writes require the Apps Script `ADMIN_PIN`.
