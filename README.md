# 🧋 WARUNG KITA 3D: KOPITIAM RUSH

A fast-paced 3D Malaysian warung / kopitiam co-op game. You do mental-math billing, timing-based cooking and Teh Tarik pulling, and you run the shop from **07:00 AM to midnight**, one day after another.

Built with plain ES modules, **Three.js r128**, Tailwind (CDN) and the Web Audio API. There is **no build step**: any static host (Netlify, GitHub Pages, `python -m http.server`) runs it as-is.

---

## ▶️ Run locally

ES modules need to be served over HTTP. Opening `index.html` with `file://` will not work.

```bash
# from the project folder
python3 -m http.server 8000
# or
npx serve .
```

Then open **http://localhost:8000** in a desktop browser or a phone held in **landscape**.

Optional: add `?quality=low` (no shadows/AA, good for older phones) or `?quality=high` to override the automatic quality detection.

## 🚀 Deploy to Netlify

* **Drag & drop:** drop the whole folder onto <https://app.netlify.com/drop>.
* **Git:** connect the repo. `netlify.toml` already sets `publish = "."` with no build command.

---

## 📁 Project structure

```
index.html          Entry: Tailwind CDN, Google Fonts (Fredoka / Plus Jakarta Sans / JetBrains Mono), Three.js r128, js/main.js
css/style.css       Teak-wood & kopitiam-marble textures, tactile buttons, landscape HUD, portrait "rotate" overlay
js/config.js        Menu + exact recipes + prices, customer archetypes, Batik canvas/SVG motifs, Firebase config placeholder
js/audio.js         Procedural Web Audio SFX + music sequencer (Tradisional Melayu Gamelan/Inang • Kopitiam Jazz Bossa • Mute)
js/characters.js    Full-body photo upload (corner chroma-key bg removal → 256×384 DataURL) + 3D Batik character generator
js/scene3d.js       3D warung, 10-min day/night cycle, signboard, DuitNow standee, stations, food stacking, Teh Tarik mugs
js/multiplayer.js   Firebase v10 Realtime Database rooms + local Demo Mode (BroadcastChannel) with the same API
js/main.js          Game loop, lobby, 3 workstations, host simulation, AI bots, chat, Recipe Book, daily reports
netlify.toml        Static-hosting config
```

---

## 🎮 How to play

| Station | What you do |
|---|---|
| **1 · 💵 Juruwang (Cashier)** | Add up the bill and type it on the register. Then handle the payment: **Tunai** (give exact change from RM50/20/10/5/1 notes and 50/20/10 sen coins), **DuitNow QR** (check the amount on the customer's pink screen: **20%** are wrong, so press *✖ Jumlah Salah!*), or **Kad PayWave** (key the amount into the terminal, then *Tap*). |
| **2 · 🍳 Chef** | Stack the exact ingredients on the 3D plate (`+`/`−`), press **🔥 Masak!**, then **✋ Angkat!** while the needle is in the **green PERFECT zone**. Too early means raw, too late means burnt. |
| **3 · 🧋 Pembancuh Air** | Measure exact scoops into the steel mug, then **hold TARIK AIR!** (or Spacebar) and release inside the **gold zone** without spilling. |

**Drink rules:** `Biasa` = 2 susu/gula · `Kurang Manis` = 1 · `Kosong` = 0 · `Kaw` = 2× powder.

| Menu | Price | Recipe |
|---|---|---|
| Nasi Lemak Biasa | RM 4.50 | 1 Nasi + 1 Sambal + 1 Telur + 1 Kacang Bilis |
| Nasi Lemak Ayam Berempah | RM 9.50 | 1 Nasi + 1 Sambal + 1 Ayam + 1 Timun |
| Roti Canai Kosong | RM 2.00 | 1 Doh + 1 Kuah Dal + 1 Kuah Kari |
| Roti Canai Banjir | RM 4.00 | 2 Doh + 2 Kuah Dal + 2 Kuah Kari + 1 Sambal |
| Satay Ayam Set | RM 6.50 | 5 Cucuk + 1 Kuah Kacang + 1 Ketupat |
| Mee Goreng Mamak | RM 7.50 | 1 Mee + 1 Telur + 1 Sayur + 1 Tahu |
| Teh Tarik | RM 2.50 | Teh + Susu Pekat |
| Kopi O Kaw | RM 2.20 | 2× Serbuk Kopi + Gula **only (no Susu Pekat!)** |
| Sirap Bandung Cincau | RM 3.50 | Sirap + Susu Pekat + Cincau |
| Milo Ais Dinosaur | RM 4.50 | 2× Serbuk Milo + Susu Pekat + Ais |

**Customers:** 👴 Pesara (patient, pays cash), 🎓 Pelajar Universiti (budget, QR), 🛵 Rider (impatient), 📸 Food Vlogger VIP (big orders, big tips). The same look or the exact same order never appears twice in a row.

**Day cycle:** each day lasts 600 s (07:00 AM → 12:00 AM). Breakfast, lunch and dinner rushes bring more customers. At midnight the **Laporan Jualan Harian** (daily sales report) appears; choose **Buka Kedai: Hari Seterusnya (Day +1)** for an endless run that gets harder each day, or **Tamat Permainan** to end.

### ⌨️ Controls
`1` `2` `3` switch station (Semua Stesen mode) · Numpad / digits = register keypad · `Enter` confirm · `Backspace` delete · `C`/`Delete` clear · `Space` = Angkat! (chef) / hold to TARIK (drinks) · `R` Recipe Book · `T` Walkie-Talkie · `Esc` pause (solo)

### Modes
* **Solo Rush:** play **all stations** yourself (switch with 1/2/3), or pick **one role** and AI bots run the others. The **📣 Gesa Bot! (Rush)** button speeds the bots up for 15 s.
* **Multiplayer:** create a room and share its **4-digit code**. The room syncs the restaurant name, full-body characters, orders and chat. Empty roles are auto-filled by AI bots. If the host leaves, the earliest remaining player becomes host.

---

## 🔥 Enabling online multiplayer (Firebase)

While `FIREBASE_CONFIG` in `js/config.js` still holds the `YOUR_…` placeholders, multiplayer runs in **Demo Mode**: rooms are shared between tabs of the **same browser** through `BroadcastChannel`, which is handy for testing. To play across devices:

1. Create a project at <https://console.firebase.google.com>, then add a **Web app**.
2. Enable **Realtime Database** (any region).
3. Paste your web config into `FIREBASE_CONFIG` in `js/config.js` (keep `databaseURL`).
4. Set database rules. A minimal casual-play setup:

```json
{
  "rules": {
    "rooms": {
      "$code": { ".read": true, ".write": true }
    }
  }
}
```

> ⚠️ These rules let anyone who knows a room code read and write that room. That is fine for casual play with friends. For a public deployment, add Firebase Auth (e.g. anonymous sign-in) and validation rules, and consider a scheduled cleanup of old `rooms/*` entries.

The Firebase v10 modular SDK (`firebase-app.js`, `firebase-database.js`) is loaded lazily from `gstatic.com`, and only once a real config is present.

---

## 📷 Custom characters

* **Muat Naik Watak Pekerja Full-Body:** upload a full-body photo for your worker.
* **Tambah Watak Pelanggan Full-Body:** add up to 8 customer photos to the customer gallery.

Photos are processed entirely in the browser. The four corners are sampled to learn the backdrop colour, then a flood-fill from the border removes **only connected background**, so a shirt that matches the wall colour survives. The edge is feathered, the figure is auto-cropped and fitted to **256×384**, and the result is compressed to WebP (PNG fallback). Plain walls or green screens work best. If you don't upload a photo, the **3D Batik generator** is used instead: Lelaki or Perempuan bertudung ayu, 4 Batik motifs (Bunga Raya, Pucuk Rebung, Awan Larat, Bunga Cengkih), skin tones and tudung colours.

Your profile and gallery are saved in `localStorage`.
