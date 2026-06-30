/**
 * PromptLab — secure checkout Cloud Function (Firebase, 2nd gen).
 *
 * Why this exists: a static site can't safely take payments or protect paid
 * content. This function is the trusted server that:
 *   1. recomputes prices from Firestore (the browser's numbers are ignored),
 *   2. charges the card via Square using your SECRET access token,
 *   3. records the order authoritatively in /orders,
 *   4. returns the full prompt text ONLY after payment succeeds.
 *
 * Deploy:  see SETUP.md  (firebase deploy --only functions)
 * Secrets: SQUARE_ACCESS_TOKEN (required), SQUARE_ENV = "sandbox" | "production"
 */
const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();
const SQUARE_ACCESS_TOKEN = defineSecret("SQUARE_ACCESS_TOKEN");

// Lock this down to your site in production, e.g. "https://USERNAME.github.io"
const ALLOWED_ORIGIN = "*";

function cors(res) {
  res.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

exports.createPayment = onRequest(
  {secrets: [SQUARE_ACCESS_TOKEN], cors: false, region: "us-central1"},
  async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({error: "Method not allowed"});

    try {
      const {items, buyerEmail, sourceId, idempotencyKey} = req.body || {};
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({error: "Your cart is empty."});
      }
      if (!sourceId) return res.status(400).json({error: "Missing payment token."});

      // ---- 1. Recompute the price server-side & gather delivery (NEVER trust the client) ----
      let amountCents = 0;
      const lines = [];
      const delivered = [];
      const seen = new Set();

      async function addPrompt(id, packId) {
        if (seen.has("p:" + id)) return;
        seen.add("p:" + id);
        const [pubSnap, contentSnap] = await Promise.all([
          db.collection("prompts").doc(id).get(),
          db.collection("promptContent").doc(id).get(),
        ]);
        if (!pubSnap.exists) return;
        const p = pubSnap.data();
        const c = contentSnap.exists ? contentSnap.data() : {promptText: "", variableMeta: {}};
        if (!packId) {
          amountCents += Math.round((p.price || 0) * 100);
          lines.push({id, type: "prompt", title: p.title, price: p.price || 0});
        }
        delivered.push({
          id, type: "prompt", title: p.title, categoryId: p.categoryId || "",
          promptText: c.promptText || "", variableMeta: c.variableMeta || {},
          ...(packId ? {packId} : {}),
        });
      }

      for (const it of items) {
        if (!it || !it.id) continue;
        if (it.type === "pack") {
          const packSnap = await db.collection("packs").doc(it.id).get();
          if (!packSnap.exists) continue;
          const pk = packSnap.data();
          amountCents += Math.round((pk.price || 0) * 100);
          lines.push({id: it.id, type: "pack", title: pk.title, price: pk.price || 0});
          for (const pid of (pk.promptIds || [])) await addPrompt(pid, it.id);
        } else {
          await addPrompt(it.id, null);
        }
      }

      if (amountCents <= 0) return res.status(400).json({error: "Nothing to purchase."});

      // ---- 2. Charge via Square ----
      const env = (process.env.SQUARE_ENV || "production").toLowerCase();
      const base = env === "sandbox"
        ? "https://connect.squareupsandbox.com"
        : "https://connect.squareup.com";

      const payResp = await fetch(base + "/v2/payments", {
        method: "POST",
        headers: {
          "Square-Version": "2024-06-04",
          "Authorization": "Bearer " + SQUARE_ACCESS_TOKEN.value(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idempotency_key: idempotencyKey || crypto.randomUUID(),
          source_id: sourceId,
          amount_money: {amount: amountCents, currency: "USD"},
          ...(buyerEmail ? {buyer_email_address: buyerEmail} : {}),
        }),
      });
      const payJson = await payResp.json();
      if (!payResp.ok || !payJson.payment || payJson.payment.status === "FAILED") {
        const msg = (payJson.errors && payJson.errors[0] && payJson.errors[0].detail) || "Payment was declined.";
        return res.status(402).json({error: msg});
      }

      // ---- 3. Record the order authoritatively ----
      const orderRef = db.collection("orders").doc();
      const order = {
        id: orderRef.id,
        lines,
        email: buyerEmail || "",
        amount: amountCents / 100,
        currency: "USD",
        status: "paid",
        squarePaymentId: payJson.payment.id,
        itemCount: delivered.length,
        createdAt: Date.now(),
      };
      await orderRef.set(order);

      // ---- 4. Deliver content only now ----
      return res.status(200).json({order, items: delivered});
    } catch (err) {
      console.error("createPayment error", err);
      return res.status(500).json({error: "Checkout failed. Please try again."});
    }
  }
);
