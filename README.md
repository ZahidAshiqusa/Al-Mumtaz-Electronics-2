# Al-Mumtaz Electronics — Hasilpur (Storefront + Admin Console + 24/7 WhatsApp Bot)

Official E-Commerce Storefront, Protected Admin Console (`/admin`), Direct Item & Checkout Slugs (`/item/:slug`, `/checkout/:slug`), and 24/7 `@whiskeysockets/baileys` WhatsApp Shopping & Two-Way Cash on Delivery (COD) Confirmation System for **Al-Mumtaz Electronics (Main Railway Road, Hasilpur — `03299931199`)**.

---

## 1. Core Features

- **Storefront (`/`)**:
  - Compact 3-column mobile & desktop product grid with hover lift animations, full-card click-to-open Product Details Modal, `🛒 Add to Bag`, `📦 Direct Checkout`, and native **Share** icon.
  - **All Electronics** tab displays **Offered Items (Flash Sale)** first, **Featured Electronics** second, and **All Products** third; **Categories** are displayed exclusively in the **Categories** tab.
  - Direct URL routing for items (`/item/:slug`), direct 1-click COD checkout (`/checkout/:slug`), and live order tracking (`/track/:orderId`).
- **Protected Admin Console (`/admin`)**:
  - Secured by `Admin_Username` and `Admin_Password`.
  - Manage **Orders** (Confirm / Dispatch / Deliver / Reject with automatic WhatsApp notifications), **Products** (custom URL slugs, multi-variant pricing, Cloudinary/SQLite image uploads), **Categories**, **Inquiries**, **Analytics**, and **WhatsApp Bot Pairing**.
- **24/7 WhatsApp Bot (Root & `Railway/`)**:
  - **Unique Menu for New Users & 24-Hour Comeback Users**: Sends a personalized welcome/comeback card containing the customer's **Username**, **Store Name**, **`🛍️ Shop Now`** (direct storefront URL), **`📋 Main Menu`** (opens Categories, Items List, Offered Items, Featured Items, Search & Order Tracking), and **`🔕 Stop WhatsApp Alerts`** (pauses bot messages for 24 hours until the next day).
  - **Two-Way COD Order Verification**: Sends itemized receipts with `✅ Confirm Order`, `💳 Pay Now`, and `❌ Cancel Order`.

---

## 2. Local Installation & Development

### Prerequisites
- **Node.js `22.x`** (uses Node's built-in `node:sqlite` engine)
- **npm** (included with Node.js)

### Step-by-Step Local Setup

1. **Clone the repository and install dependencies**:
   ```bash
   git clone https://github.com/ZahidAshiqusa/Al-Mumtaz-Electronics.git
   cd Al-Mumtaz-Electronics
   npm install
   ```

2. **Configure environment variables (optional for local run)**:
   ```bash
   cp .env.example .env
   ```
   Default credentials if `.env` is unchanged:
   - **Admin URL**: `http://localhost:3000/admin`
   - **Username**: `admin`
   - **Password**: `AlMumtaz@2026`

3. **Start the application**:
   ```bash
   npm start
   ```
   - **Storefront**: `http://localhost:3000`
   - **Admin Console**: `http://localhost:3000/admin`
   - **Health Check**: `http://localhost:3000/api/health`

4. **Run build, syntax lint, and unit tests**:
   ```bash
   npm run build
   npm run lint
   npm test
   ```

---

## 3. Deploying to Vercel (Storefront + Express Serverless API)

This repository is pre-configured for **Vercel's Zero-Config Express Builder**:
- `server.js` in the project root exports the Express `app` (`module.exports = app;`) and skips `app.listen()` when `process.env.VERCEL` is set.
- Static assets in `public/` (`index.html`, `admin.html`, `js/*`, `images/*`, and pre-built `data/bootstrap.json`) are served automatically alongside all Express routes (`/api/*`, `/admin`, `/item/:slug`, `/product/:slug`, `/checkout/:slug`, `/track/:orderId`).

### Vercel Deployment Steps
1. Push your repository to GitHub (`main` branch).
2. In **Vercel Dashboard** → **Add New Project** → Import your repository.
3. Keep **Root Directory** as `./` and leave **Output Directory** blank / default (do **not** set Output Directory to `public` in the Vercel UI, so Vercel finds `server.js` in the root).
4. Under **Environment Variables**, add:
   | Variable | Example Value | Description |
   | :--- | :--- | :--- |
   | `Admin_Username` | `admin` | Admin login username for `/admin` |
   | `Admin_Password` | `AlMumtaz@2026` | Admin login password for `/admin` |
   | `Admin_Whatsapp` | `923299931199` | Store owner WhatsApp number |
   | `Railway_URL` | `https://al-mumtaz-electronics-prod.up.railway.app` | Your 24/7 Railway WhatsApp Bot URL |
   | `API_SECRET_KEY` | `almumtaz-secret-2026` | Shared secret matching Railway |
   | `STORE_URL` | `https://your-project.vercel.app` | Your public Vercel domain |
   | `Cloudinary_URI` | `cloudinary://key:secret@cloud` | *(Optional)* Cloudinary URI for permanent image hosting |
5. Click **Deploy**.

---

## 4. Deploying the 24/7 WhatsApp Bot on Railway (`Railway/` Folder)

Because WhatsApp (`@whiskeysockets/baileys`) requires a persistent WebSocket connection, run the WhatsApp bot 24/7 on **Railway**:

1. In **Railway Dashboard** → **New Project** → **Deploy from GitHub repo**.
2. Open **Settings → Service → Root Directory** and set it to:
   ```text
   Railway
   ```
3. Open **Variables** in Railway and set:
   | Variable | Example Value | Description |
   | :--- | :--- | :--- |
   | `STORE_URL` | `https://ais-pre-hiuyw6voetxjeqvop7f4jn-955644874863.asia-east1.run.app` | Your main website URL (no trailing `/`) |
   | `SITE_API_URL` | `https://ais-pre-hiuyw6voetxjeqvop7f4jn-955644874863.asia-east1.run.app/api` | Your main website API URL (`${STORE_URL}/api`) |
   | `API_SECRET_KEY` | `almumtaz-secret-2026` | Must match `API_SECRET_KEY` on your main website |
   | `ADMIN_NUMBER` | `923299931199@s.whatsapp.net` | Owner WhatsApp JID for order & inquiry alerts |
   | `Admin_Whatsapp` | `923299931199` | Numeric owner WhatsApp fallback |
   | `Admin_Username` | `admin` | Must match website `Admin_Username` |
   | `Admin_Password` | `AlMumtaz@2026` | Must match website `Admin_Password` |
   | `IS_RAILWAY_BACKEND` | `true` | Enables standalone Railway WhatsApp bridge |
   | `PORT` | `3000` | Listening port |
4. Open **Settings → Networking → Generate Domain** (e.g. `https://al-mumtaz-electronics-prod.up.railway.app`).
5. Copy that Railway domain into `Railway_URL` on your main website (or in `/admin` → **Settings & Vars**), then open `/admin` → **Link WhatsApp** to generate your 8-digit WhatsApp pairing code.
