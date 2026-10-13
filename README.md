# alto. store: jQuery + public API + Express + MySQL (XAMPP)

This branch is prepared for a review pass. It includes a small documentation refresh for onboarding and a clearer project overview before the pull request is shared with reviewers.

## Project status
- Frontend: jQuery-based storefront UI
- Backend: Express API with MySQL persistence
- Public API integration: dummyjson.com product search
- Intended use: local demo / learning project with XAMPP + Node.js

## 1. How the project works (general flow)

```
 BROWSER  (frontend/: index.html + style.css + script.js, all interaction in jQuery)
    │
    ├─ Q2  $.ajax GET ─────────────► dummyjson.com (public API) ──► JSON ──► product cards on the page
    │
    ├─ Q3  $.ajax GET  /api/products ┐
    ├─ Q3  $.ajax GET  /api/configurations and /api/orders
    ├─ Q3  $.ajax POST /api/configurations ─┤  (JSON.stringify(config))
    └─ Q3  $.ajax POST /api/orders ─────────┤  (customer + cart)
                                            ▼
                         NODE.JS + EXPRESS  (backend/server.js, port 3000)
                           1. cors()          lets the browser call us from another port
                           2. express.json()  turns the JSON body into req.body
                           3. custom logger   prints METHOD + URL in this terminal
                           4. routes          GET reads catalog and saved records; POST validates + saves
                                            │
                                            ▼
                         MYSQL in XAMPP (database alto_store)
                           products · customers · configurations · orders · order_items
```

| Question | Where it is |
|---|---|
| Q1 jQuery | Every handler in `script.js` is jQuery: `$()` selectors, `.on()` events, `.val()`, `.text()`, `.html()/.append()`, `.addClass()`, `.css()`, `.prop()`, `.data()`. The preview, price, [...] |
| Q2 Public API | "Add-ons from a public API" panel. Search box, then `$.ajax` GET to `https://dummyjson.com/products/search?q=...&limit=6`. Handles empty results, errors and no internet. |
| Q3 Express + MySQL | `backend/server.js`. Products are loaded from `products`; saved configurations, customers, orders and order items are persisted in MySQL. GET `/api/products`, `/api/configurations`, `/api/orders`; POST to save configuration and order records. |

The **Request and response log** panel shows every call (URL, status, JSON). DevTools and the backend terminal show the same.

## 2. What you need
- **XAMPP** (for MySQL, and Apache if you want to serve the frontend with it)
- **Node.js LTS** (nodejs.org). Check with `node -v`

## 3. Folder structure
```
alto-store/
├── README.md
├── backend/
│   ├── server.js        Express server
│   ├── package.json     express, cors, mysql2
│   └── schema.sql       optional: same table, for phpMyAdmin
└── frontend/
    ├── index.html
    ├── style.css
    └── script.js
```

## 4. Run it, step by step

**Step 1: Start MySQL in XAMPP.** Open the XAMPP Control Panel and press **Start** next to **MySQL** (it shall turn green, port 3306). Apache is only needed for Option A below.

**Step 2: Start the backend.** using terminal:
```
cd backend
npm install
node server.js
```
Expected output:
```
MySQL connected: database "alto_store" is ready
Server running on http://localhost:3000
```
The server creates `alto_store`, creates the tables, seeds the catalog, and adds `customer_email` to an older `configurations` table when needed. `backend/schema.sql` provides the matching import structure for phpMyAdmin.

If your XAMPP MySQL has a root password, run: `set DB_PASSWORD=yourpassword` (Windows) or `export DB_PASSWORD=yourpassword` (Mac/Linux) before `node server.js`.

**Step 3: Open the frontend.** Pick one:
- **Option A (XAMPP Apache):** copy the `frontend` folder into `C:\xampp\htdocs\` and rename it `alto`. Start **Apache** in XAMPP. Open `http://localhost/alto/`.
- **Option B (VS Code):** right-click `frontend/index.html`, then **Open with Live Server** (`http://127.0.0.1:5500`).
- Double-clicking `index.html` also works.

Frontend and backend run on different ports. The backend allows this with `cors()`.

**Step 4: Check the green chip.** In the "Live data and backend" section you should see **Server online · storage: MySQL (XAMPP)**.

**Step 5: See your data.** Place an order or save a design with a name and email, then open `http://localhost/phpmyadmin` → database `alto_store`. Browse `products` for the catalog, `customers` [...] 

## 5. Demo checklist (screenshots and video)
Open DevTools (F12), **Network** tab, **Fetch/XHR** filter.

1. **Customize:** change finish, size, engraving (try the idea chips), hover and drag the bottle into the cart.
2. **Premium lock:** click a locked option. The payment **popup** opens. Type a name and number and watch them engrave on the card. Click the CVV field and the card flips. Press **Fill test card**[...] 
3. **Q2:** type `bottle`, press **Search**. Network shows `GET dummyjson.com/products/search?q=bottle&limit=6`. Open Response to see the JSON. Press **Add to cart** on a card. Turn Wi-Fi off and s[...] 
4. **Q3 GET:** press **Load catalog**. Network shows `GET localhost:3000/api/products`, and the backend terminal prints `GET /api/products`.
5. **Q3 POST:** enter a name and email, then press **Save design to server**. Network, Payload tab shows the JSON you sent. The response identifies the saved design, and it appears under **Saved designs**.
6. **Checkout:** add a bottle (and optional API add-ons) to the cart, enter a name and email, and place the order. The order and line items are saved together; use **Recent orders** or phpMyAdmin to inspect the database.
7. **403 case:** reload the page (Free user), you cannot pick premium options. This is also enforced on the server.

## 6. Troubleshooting
| Problem | Fix |
|---|---|
| `Server offline` chip is red | Backend not running. Run `node server.js` in `backend` |
| `MySQL not available (ECONNREFUSED)` | MySQL is not started in XAMPP. Press Start, restart `node server.js` |
| `ER_ACCESS_DENIED_ERROR` | Root has a password. Set `DB_PASSWORD` (see Step 2) |
| MySQL will not start (port 3306 in use) | Stop another MySQL service, or change the port in XAMPP and set `DB_PORT` |
| `EADDRINUSE :3000` | Another app uses port 3000. Close it, or `PORT=3001 node server.js` and change `BACKEND_URL` at the top of `script.js` |
| `Cannot find module 'express'` | Run `npm install` inside `backend` |
| CORS error in console | Restart the server. `app.use(cors())` must be before the routes |
| `$ is not defined` | The jQuery `<script>` tag must come before `script.js` |
| Public API fails | Needs internet. Test `https://dummyjson.com/products?limit=1` in the browser |
| Video or Lottie missing | They load from the internet (Pexels, LottieFiles). Without internet the page shows a fallback message and a check mark |

