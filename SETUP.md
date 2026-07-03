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
The store uses **Buy now** on each prompt and pack — no cart. Since your prompts are all one price and your packs are all one price, you only need **two Square links**: one for single prompts, one for packs.
1. Square Dashboard → **Online → Payment Links → Create** two links: one at **$2** ("Single prompt") and one at **$25** ("Prompt pack"). In **each** link's settings, under **After payment** set **redirect to** `https://USERNAME.github.io/REPO/#/success` (your live site URL + `#/success`). This redirect is what unlocks the purchase on return — don't skip it.
2. Paste them in the dashboard: log in (**Ctrl + Alt + Shift + L**) → **Site Config → Payments** → put the $2 link in **Single-prompt payment link** and the $25 link in **Pack payment link** → **Save changes.**
3. Done. A prompt's **Buy now** uses the single-prompt link; a pack's **Buy now** uses the pack link; both unlock in the buyer's Library on return. (Need a one-off differently-priced item later? Give just that item its own link in its editor — it overrides the two defaults.)

> **Honest trade‑offs of the simple path** (fine for getting started):
> - It's **two fixed-price links** (one per price tier) — that's why Buy-now replaced the cart, since a cart's variable total can't map to a fixed Square link without a backend. Mixed prices later = give those items their own links.
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

## 3b. Buyer accounts
Buyers **must create a free account (email + password) before they can purchase**, and every purchase is saved to that account — so they can log in on any device and their Library is there. This runs on the same **Email/Password** provider you already enabled in step 1; nothing extra to turn on. Admin is just the one special account (`admin@promptlab.app`); everyone else is a buyer.

## 4. Security rules
Firestore → **Rules** → paste → **Publish.** This one block covers accounts, buyers' libraries, orders, analytics events, and admin — for the simple path. **Re-publish these whenever you update the app** — the dashboard stats and pack delivery depend on the `orders` and `events` rules below.
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function isAdmin()  { return request.auth != null && request.auth.token.email == 'admin@promptlab.app'; }
    function signedIn() { return request.auth != null; }

    match /prompts/{id}        { allow read: if true;       allow write: if isAdmin(); }
    match /packs/{id}          { allow read: if true;       allow write: if isAdmin(); }
    match /categories/{id}     { allow read: if true;       allow write: if isAdmin(); }
    match /siteConfig/{id}     { allow read: if true;       allow write: if isAdmin(); }

    // Full prompt text: only logged-in accounts can read it (needed to deliver a purchase);
    // anonymous visitors cannot. The advanced path locks this down further (see below).
    match /promptContent/{id}  { allow read: if signedIn(); allow write: if isAdmin(); }

    // Each buyer owns exactly their own library document.
    match /libraries/{uid}     { allow read, write: if signedIn() && request.auth.uid == uid; }

    // Buyers record their own order at delivery time; only you can read/manage them.
    match /orders/{id}         { allow read: if isAdmin();  allow create: if signedIn(); allow update, delete: if isAdmin(); }

    // Site analytics events (views, checkouts, purchases) — anyone can log, only you can read.
    match /events/{id}         { allow create: if true;     allow read: if isAdmin(); allow update, delete: if false; }

    match /customRequests/{id} { allow read: if isAdmin();  allow create: if true; allow update, delete: if isAdmin(); }
  }
}
```
> Uses your admin email (`admin@promptlab.app`) to tell the owner apart from buyers — **that's why buyers signing up doesn't make them admins.** If you changed `CONFIG.adminEmail`, change it in the rule too.

**Advanced path** (Cloud Function): the function delivers content, so buyers never read it directly — lock it fully and let the function write orders:
```
    match /promptContent/{id}  { allow read: if isAdmin(); allow write: if isAdmin(); }  // truly locked
    match /orders/{id}         { allow read: if isAdmin(); allow write: if false; }       // function writes via Admin SDK
```
(Everything else identical.)

## 5. Add your catalog
Empty by default. In the dashboard: **Create prompt / pack / category**, or on an empty catalog the Overview offers **Import starter content** (sample prompts you can edit or delete).

## 6. Go live (GitHub Pages)
1. Put `index.html`, `sitemap.xml`, `robots.txt` in a repo → **Settings → Pages → main / root.**
2. Replace `USERNAME/REPO` in `sitemap.xml`, `robots.txt`, and in your Square link's redirect URL.

---

## Content protection — how it works now
- The product page shows **only** marketing: title, description, an **example output**, the customizable variable names, and a locked panel with word/variable counts. **The actual prompt template is never rendered before purchase** — there's no teaser to copy, so buying is the only way to get it.
- The full prompt lives in a separate `promptContent` record; the public catalog carries none of it.
- **Simple path:** only **logged-in accounts** can read prompt text (to deliver a purchase) — anonymous visitors can't, and it's never on the product page. A determined *logged-in* user could still fetch content they didn't buy; the advanced path closes that.
- **Advanced path:** content is locked in Firestore and released **only** in the function's post‑payment response. Truly unreadable until paid.

## Local preview (design only)
On the setup screen (only shows if Firebase is removed) choose **Preview locally** — runs on this browser with a starter catalog and an emulated checkout (no real charge) so you can click the whole flow. Admin password is the same `promptlabadmin`.

## Tech
Vanilla HTML/CSS/JS, hash router, Firebase Firestore + Auth + Analytics (CDN), Square hosted Payment Links (simple) or Square Web Payments SDK + a Cloud Function (advanced). No build step.
