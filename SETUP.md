# PromptLab — Setup & Deployment

A single‑file AI prompt marketplace. Runs immediately in **local demo mode**, and flips to a live **Firebase** backend + **Square** checkout when you add your keys. No build step, no server.

---

## 1. Deploy to GitHub Pages
1. Create a repo and drop in `index.html`, `sitemap.xml`, `robots.txt`.
2. Repo → **Settings → Pages** → Source: `main` / root. Save.
3. Visit `https://USERNAME.github.io/REPO/`. Done — it works out of the box.

It also runs by just opening `index.html` locally (double‑click). Demo data lives in the browser's local storage.

---

## 2. Admin dashboard
- **Desktop:** press **Ctrl + Alt + Shift + L** anywhere → password modal.
- **Mobile:** press‑and‑hold the logo (~1s).
- **Demo password:** `promptlab` (change `CONFIG.demoAdminPassword` in `index.html`).

From the dashboard you can create/edit prompts (with a live variable detector), build packs, manage categories, handle custom requests, edit all site text + legal pages, set pricing, and view analytics. Every change is live instantly — no redeploy.

> The keybind hides the *entrance*, but a static site's source is always public. Real protection comes from the Firestore security rules below — that's what actually stops unauthorized writes.

---

## 3. Go live with Firebase (optional)
1. Create a Firebase project → add a **Web app** → copy the config.
2. In `index.html`, replace the `CONFIG.firebase` block (the `apiKey` placeholder is the on/off switch).
3. Enable **Firestore** and **Authentication → Email/Password**.
4. Create your owner login under Auth, then add a doc at `admins/{that-uid}` with `{ "role": "owner1", "name": "Your Name" }`.
5. Seed content by creating it in the dashboard (writes straight to Firestore), or import your own docs into the `prompts`, `packs`, `categories`, and `siteConfig/main` collections.

### Firestore security rules (paste into Rules tab)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function isAdmin() {
      return request.auth != null &&
             exists(/databases/$(db)/documents/admins/$(request.auth.uid));
    }
    match /prompts/{id}        { allow read: if true;  allow write: if isAdmin(); }
    match /packs/{id}          { allow read: if true;  allow write: if isAdmin(); }
    match /categories/{id}     { allow read: if true;  allow write: if isAdmin(); }
    match /siteConfig/{id}     { allow read: if true;  allow write: if isAdmin(); }
    match /customRequests/{id} { allow read: if isAdmin();
                                 allow create: if true;        // public can submit
                                 allow update, delete: if isAdmin(); }
    match /purchases/{id}      { allow read: if isAdmin();
                                 allow create: if false;       // see note below
                                 allow update, delete: if false; }
    match /admins/{id}         { allow read: if isAdmin(); allow write: if false; }
  }
}
```

---

## 4. Payments with Square
Static hosting can't safely process cards (that needs a secret server key), so PromptLab uses **Square hosted checkout links** — the correct no‑backend pattern.

1. Square Dashboard → **Online → Checkout links** → create a link per prompt/pack (or one store link).
2. In the link's settings, set **"After payment" redirect** to `https://USERNAME.github.io/REPO/#/success`.
3. Paste links in the dashboard: **Site Config → Payments** (default link) or per item in the Prompt/Pack editor.

Buy buttons redirect to Square's secure page; the customer returns to your success page.

> **Purchase records (production):** the demo writes a "pending" purchase from the browser. With the rule `purchases create: if false`, that client write is blocked in production — which is correct. To record confirmed sales, add a tiny **Square webhook → Firebase Cloud Function** that writes the `purchases` doc with admin privileges after Square confirms payment. (This one Function is the only server‑side piece, and it's optional — the marketplace and checkout work without it.)

---

## 5. SEO
Update `USERNAME/REPO` (or your custom domain) in `sitemap.xml` and `robots.txt`. The page already ships meta tags, Open Graph, and JSON‑LD Organization schema.

---

## Tech
Vanilla HTML/CSS/JS, hash router, Firebase Firestore + Auth (modular v10 via CDN), Square hosted checkout. No frameworks, no bundler.
