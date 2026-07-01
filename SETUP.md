# PromptLab — Setup

A single‑file AI prompt marketplace: cart, Square checkout, content‑protected prompts, and a "My Library." Your Firebase keys are already pasted in — so out of the box the app boots straight to the store. There are two things left: turn on payments, and (optionally) lock the content down server‑side.

You can be **live and selling in ~10 minutes** with the simple path. The advanced path adds server‑verified orders + truly locked content later, whenever you want.

---

## 1. Firebase (already connected)
`CONFIG.firebase` in `index.html` already holds your `promptlab-d8302` keys, so the setup screen is gone and the store is live. Just make sure the backend is switched on:
1. console.firebase.google.com → your **promptlab‑d8302** project.
2. **Firestore Database** → Create (production mode) if you haven't.
3. **Authentication → Sign‑in method → Email/Password = enabled.** Leave **Anonymous disabled** (the rules treat any signed‑in session as the owner).
4. (Analytics already wired via your `measurementId` — events flow to GA4 automatically.)

## 2. Shared admin login (one password, both of you)
No individual accounts. One shared password unlocks the dashboard.
1. Firebase → **Authentication → Users → Add user.**
2. Email **`admin@promptlab.app`** · Password **`promptlabadmin`** (these match `CONFIG.adminEmail` / `CONFIG.adminPassword` — change both together if you want something else).
3. On the site press **Ctrl + Alt + Shift + L** (or long‑press the logo on mobile), type the password. Being signed into that one account = being an owner. That's the whole setup — no `admins` collection.

## 3. Payments — pick ONE path

### ⭐ Simple path (recommended to start — no backend, no Blaze plan)
The store uses **Buy now** on each prompt and pack — no cart. Because Square payment links are a **fixed amount**, this is the clean fit: **one Square link per item, priced to match.**
1. Square Dashboard → **Online → Payment Links → Create** a link for a prompt (set the amount to that prompt's price). Under **After payment**, set **redirect to** `https://USERNAME.github.io/REPO/#/success` (your live site URL + `#/success`). This redirect is what unlocks the prompt on return — don't skip it. Repeat per prompt/pack (or reuse links across items that share a price).
2. Paste each link into that item: log in (**Ctrl + Alt + Shift + L**) → **Prompts/Packs → edit → Square checkout link → Save.** You can also set one fallback in **Site Config → Payments → Default Square checkout link** for anything without its own link.
3. Done — each item's **Buy now** sends the buyer to that Square link, and the prompt unlocks in their Library when they return.

> **Honest trade‑offs of the simple path** (fine for getting started):
> - It's **one fixed-price link per item** (that's why Buy-now replaced the cart — a cart's variable total can't map to a fixed Square link without a backend).
> - Delivery happens **on return from Square** (no server verifying each payment), and sales are recorded in your **Square dashboard** (not the app's Orders tab).
> - Because there's no server to hand out the prompt, the text must be **readable by the app to deliver it** (rules below). The product page shows **no prompt text** — your real concern — but a technical user could read it from the database. The advanced path closes that gap.
> - The cart is still in the code (disabled). Re-enabling it only makes sense alongside the advanced path, which can charge a real cart total.

### 🔒 Advanced path (optional — server‑verified orders + fully locked content)
Deploy the included function; payments are charged & verified server‑side, orders are recorded in‑app, prompt text is never readable until paid, and dynamic totals (e.g. a re‑enabled cart) work.
```bash
npm install -g firebase-tools && firebase login
firebase init functions           # pick promptlab-d8302; JavaScript; keep functions/
firebase functions:secrets:set SQUARE_ACCESS_TOKEN     # paste your Square access token
firebase deploy --only functions  # prints https://...cloudfunctions.net/createPayment
```
Then in `index.html` fill the **advanced** fields (these override the simple link):
```js
square: { checkoutUrl: "", appId: "sq0idp-…", locationId: "L…" },
checkoutFunctionUrl: "https://us-central1-promptlab-d8302.cloudfunctions.net/createPayment",
```
Set `SQUARE_ENV=sandbox` on the function while testing (Firebase console → Functions → Variables); it defaults to production. Square sandbox test card: `4111 1111 1111 1111`, any future expiry / CVV / ZIP.

## 4. Security rules
Firestore → **Rules** → paste → **Publish.** Use the block that matches your path.

**Simple path** (buyers can read prompt text so it can be delivered after a Square‑link payment):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function owner() { return request.auth != null; }      // shared admin = only login
    match /prompts/{id}        { allow read: if true;  allow write: if owner(); }
    match /packs/{id}          { allow read: if true;  allow write: if owner(); }
    match /categories/{id}     { allow read: if true;  allow write: if owner(); }
    match /siteConfig/{id}     { allow read: if true;  allow write: if owner(); }
    match /promptContent/{id}  { allow read: if true;  allow write: if owner(); }  // needed for link-mode delivery
    match /orders/{id}         { allow read: if owner(); allow write: if owner(); }
    match /customRequests/{id} { allow read: if owner(); allow create: if true; allow update, delete: if owner(); }
  }
}
```

**Advanced path** (content truly locked; only the function — via Admin SDK — reads it):
```
    match /promptContent/{id}  { allow read: if owner();  allow write: if owner(); }   // locked
    match /orders/{id}         { allow read: if owner();  allow write: if false; }     // function writes orders
```
(Everything else identical to the block above.)

## 5. Add your catalog
Empty by default. In the dashboard: **Create prompt / pack / category**, or on an empty catalog the Overview offers **Import starter content** (sample prompts you can edit or delete).

## 6. Go live (GitHub Pages)
1. Put `index.html`, `sitemap.xml`, `robots.txt` in a repo → **Settings → Pages → main / root.**
2. Replace `USERNAME/REPO` in `sitemap.xml`, `robots.txt`, and in your Square link's redirect URL.

---

## Content protection — how it works now
- The product page shows **only** marketing: title, description, an **example output**, the customizable variable names, and a locked panel with word/variable counts. **The actual prompt template is never rendered before purchase** — there's no teaser to copy, so buying is the only way to get it.
- The full prompt lives in a separate `promptContent` record; the public catalog carries none of it.
- **Simple path:** content is delivered to the browser after the Square‑link payment, so the rules let it be read (a determined user could fetch it directly — but it's off the product page entirely).
- **Advanced path:** content is locked in Firestore and released **only** in the function's post‑payment response. Truly unreadable until paid.

## Local preview (design only)
On the setup screen (only shows if Firebase is removed) choose **Preview locally** — runs on this browser with a starter catalog and an emulated checkout (no real charge) so you can click the whole flow. Admin password is the same `promptlabadmin`.

## Tech
Vanilla HTML/CSS/JS, hash router, Firebase Firestore + Auth + Analytics (CDN), Square hosted Payment Links (simple) or Square Web Payments SDK + a Cloud Function (advanced). No build step.
