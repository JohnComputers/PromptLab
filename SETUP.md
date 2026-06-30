# PromptLab — Production Setup

A single‑file AI prompt marketplace with a **cart**, **secure server‑verified checkout**, **content protection**, and **recorded orders**. The store stays hidden behind a setup screen until you connect Firebase, because a real marketplace needs one shared backend that every visitor reads from.

There are two pieces to deploy:
1. **The site** (`index.html`) → any static host (GitHub Pages).
2. **The checkout function** (`functions/`) → Firebase Cloud Functions. This is what makes payments actually secure — see "How checkout is secured" at the bottom.

---

## 1. Firebase project (2 min)
1. console.firebase.google.com → create a project.
2. Add a **Web app**, copy the `firebaseConfig`.
3. Enable **Firestore Database** (production mode).
4. Enable **Authentication → Sign‑in method → Email/Password**. **Leave "Anonymous" disabled** (the security rules treat any signed‑in session as the owner).

## 2. Connect the site (1 min)
In `index.html`, top of the `CONFIG` block, paste your config:
```js
firebase: { apiKey: "AIza…", authDomain: "…", projectId: "…",
            storageBucket: "…", messagingSenderId: "…", appId: "…" }
```
Reload — the setup screen disappears and the store goes live.

## 3. Shared admin login (no individual accounts)
Both owners use ONE shared password — there are no per‑person accounts.
1. Firebase → **Authentication → Users → Add user**.
2. Email: **`admin@promptlab.app`**  ·  Password: **`promptlabadmin`**
   (these are the defaults in `CONFIG.adminEmail` / `CONFIG.adminPassword` — change both if you like; just keep them in sync with what you create here).
3. That's it. Open the site, press **Ctrl + Alt + Shift + L** (or long‑press the logo on mobile), type the password. Being signed into that one account = being an owner, so every catalog write is allowed and the database stays locked to everyone else.

## 4. Security rules
Firestore → **Rules** → paste and **Publish**:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function owner() { return request.auth != null; }   // shared admin is the only login

    match /prompts/{id}        { allow read: if true;     allow write: if owner(); }
    match /packs/{id}          { allow read: if true;     allow write: if owner(); }
    match /categories/{id}     { allow read: if true;     allow write: if owner(); }
    match /siteConfig/{id}     { allow read: if true;     allow write: if owner(); }

    // Full prompt text — never world‑readable. Owner can read it to edit;
    // the checkout function reads it with the Admin SDK to deliver after payment.
    match /promptContent/{id}  { allow read: if owner();  allow write: if owner(); }

    // Orders are written by the Cloud Function (Admin SDK bypasses rules).
    match /orders/{id}         { allow read: if owner();  allow write: if false; }

    match /customRequests/{id} { allow read: if owner();
                                 allow create: if true;            // public can submit
                                 allow update, delete: if owner(); }
  }
}
```

## 5. Square + the checkout function (secure payments)
On a static host the browser can't be trusted with prices or card charges, so the included function handles it.

**a) Square Developer dashboard** (developer.squareup.com):
- Create an app. Copy the **Application ID** and a **Location ID**.
- Copy an **Access token** (Sandbox token to test, Production token to go live). This is a SECRET — it only ever lives in the function, never in `index.html`.

**b) Deploy the function:**
```bash
npm install -g firebase-tools
firebase login
firebase init functions      # pick your project; JavaScript; skip overwrite of functions/
# set the secret access token:
firebase functions:secrets:set SQUARE_ACCESS_TOKEN
# choose environment (default is production):
firebase deploy --only functions
```
For sandbox testing set the env var `SQUARE_ENV=sandbox` on the function (Firebase console → Functions → your function → Variables), otherwise it defaults to production. Deploy prints a URL like
`https://us-central1-YOURPROJECT.cloudfunctions.net/createPayment`.

**c) Point the site at it** — in `index.html` `CONFIG`:
```js
square: { appId: "sq0idp-…", locationId: "L…", defaultCheckoutUrl: "" },
checkoutFunctionUrl: "https://us-central1-YOURPROJECT.cloudfunctions.net/createPayment",
```
Reload. Checkout now shows a Square card field; payment is charged + verified server‑side, the order is recorded, and the prompt is delivered only on success.

> Card testing (sandbox): Square's test card is `4111 1111 1111 1111`, any future expiry, any CVV/ZIP.

## 6. Add your catalog
Empty by default — nothing shows until you add it. In the dashboard:
- **Create prompt / pack / category**, or
- On an empty catalog the Overview offers **Import starter content** (sample prompts you can edit or delete).

## 7. Deploy the site (GitHub Pages)
1. Put `index.html`, `sitemap.xml`, `robots.txt` in a repo.
2. **Settings → Pages** → `main` / root.
3. Replace `USERNAME/REPO` in `sitemap.xml` and `robots.txt`.

---

## How checkout is secured
- **Card data** is tokenized in the browser by Square's Web Payments SDK — it never touches the site or your server (PCI SAQ‑A).
- **Price** is recomputed by the function from Firestore. A tampered client price is ignored.
- **Payment** is charged with your secret Square token, server‑side, before anything is delivered.
- **Content** isn't world‑readable: the public catalog holds only a title, description, variable names and a short preview. The full prompt lives in `promptContent` (locked) and is returned **only** in the function's post‑payment response.
- **Orders** are written by the function (clients can't forge them) and shown in your dashboard.

**Delivery / "My Library":** purchased prompts are unlocked in the buyer's Library, cached in their browser. Re‑downloading on another device would require buyer accounts (not included) — orders are always recorded server‑side regardless.

## Local preview (design only)
On the setup screen choose **Preview the storefront locally**. Runs on this browser only with the starter catalog; checkout uses a built‑in emulator (no real charge) so you can click through the whole flow. Admin password is the same `promptlabadmin`.

## Tech
Vanilla HTML/CSS/JS, hash router, Firebase Firestore + Auth (modular v10 via CDN), Square Web Payments SDK + a Firebase Cloud Function for charges. No build step.
