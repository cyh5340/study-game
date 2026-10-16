# Circuit Runner

A buildless, installable offline Progressive Web App for learning introductory DC circuits.

## Run locally

Serve this directory with any static web server, then open `index.html`. For example:

```powershell
python -m http.server 4173
```

Then visit `http://localhost:4173`.

## Deploy to Vercel

Import the repo in Vercel (Framework Preset: **Other**, no build command, output directory = root), or run `vercel --prod` from this folder.

## Install on Android

1. Host this folder over HTTPS (localhost is also allowed for development).
2. Open the URL in Chrome on Android.
3. Choose **Install app** or **Add to Home screen**.

After the first successful load, the service worker caches every required file. The installed game opens in a standalone window and works without an internet connection.

## Physics architecture

- `physics.js` contains only deterministic, unit-based calculation functions.
- `levels.js` contains constrained numeric generators and delegates all answers to `physics.js`.
- Every campaign gets fresh numeric inputs; a seed can reproduce any campaign for testing.
- Randomness selects inputs only. Answers always come from deterministic physics functions, never AI or a network request.

## Controls

- Left/Right: change rail
- Space: pulse jump
- P: pause

The first playable mission asks the player to choose a series resistor that drives a 2 V LED at 20 mA from a 9 V supply.
