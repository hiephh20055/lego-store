# Capstone Project 2 — MIS for a Toy Store

**Topic:** A Management Information System (MIS) that supports operations for an **online toy store**, including retail workflows, product catalog management, customer management, cart/order processing, and basic operational reporting for administrators.

**Demo system name:** **PLAYARENA** — a LEGO-style toy e-commerce website built for academic purposes.

---

## MIS Overview

| Aspect | Description |
|-----------|--------|
| **Stakeholders** | Customers (shopping) and administrators (products, users, orders) |
| **Data flow** | Web interface -> API -> SQLite (users, products, orders, order items) |
| **Decision support** | Order tracking, catalog management (CRUD), and user/admin role control |
| **Technology** | Static frontend (HTML/CSS/JS), Node.js + Express backend, JWT + bcrypt |

---

## Team Members and Task Allocation

*Please update the **Full Name** and **Student ID** columns with your actual team information.*

| No. | Full Name | Student ID | Tasks |
|:---:|:------|:----:|:-----------------|
| 1 | Nguyen Quang Bao |  | Analyze toy-store MIS business requirements; define functional scope; maintain README and Capstone documentation; compile final report |
| 2 | Dau Khanh Linh | | UI/UX design for Home, Shop, About, and Help pages; Tailwind styling; consistent navigation and branding |
| 3 | Nguyen Thanh Dung |  | Cart, wishlist, and checkout features; integrate `GET /products`; persist cart in `localStorage`; cart page implementation |
| 4 | Nguyen Duc Hiep |  | Backend core: Express + SQLite; JWT login/register; profile endpoint; authentication middleware |
| 5 |Nguyen Minh Tung  |  | Orders backend (`POST/GET /orders`, order details); `orders` / `order_items` schema; admin APIs for products and users |
| 6 | |  | Admin dashboard UI; API testing with Postman; test scenarios; demo execution and presentation slides |

---

## Technology Stack

| Layer | Technology |
|------|-----------|
| Frontend | HTML, Tailwind CSS (CDN), JavaScript |
| Backend | Node.js, Express |
| Database | SQLite (`backend/users.db`) |
| Authentication | JWT, bcrypt |

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS version recommended)

## Installation

From the project root:

```bash
npm install
```

## Run the System

Always start the server from the **`backend`** directory (so the `users.db` path is correct):

```bash
cd backend
node server.js
```

- API and static frontend hosting: **http://localhost:3000**
- **Shop:** [http://localhost:3000/products.html](http://localhost:3000/products.html)  
- **Home:** [http://localhost:3000/](http://localhost:3000/)

When opened via port 3000, the frontend uses same-origin API calls. If you open pages directly via `file://` or use Live Server on another port, the code still targets `http://localhost:3000`, so the backend must be running.

## Database

- SQLite file: **`backend/users.db`** with tables `users`, `products`, `orders`, `order_items`.
- Initialize schema manually: `cd backend` -> `node initDb.js`.
- The server auto-seeds demo products when the `products` table is empty (first run).

## Admin Account (Development)

### Method 1 — Temporary Admin

```bash
cd backend
node seedTempAdmin.js
```

Log in using the email/password printed in the terminal. **Development use only.**

### Method 2 — Promote an Existing User to Admin

```bash
cd backend
node makeAdmin.js registered-email@example.com
```

List users with: `node checkUsers.js`.

## API Summary

| Method | Endpoint | Description |
|-------------|-----------|--------|
| POST | `/register` | Register a new account |
| POST | `/login` | Login -> returns `token`, `role` |
| GET | `/profile` | Requires `Authorization: Bearer <token>` |
| GET | `/products` | Public product list |
| POST | `/orders` | Place an order (`items[]`, login required) |
| GET | `/orders` | Current user's orders |
| GET | `/orders/:id` | Order details (owner or admin) |
| GET | `/admin/orders` | All orders (admin) |
| POST | `/admin/products` | Create product (admin) |
| PUT | `/admin/products/:id` | Update product (admin) |
| DELETE | `/admin/products/:id` | Delete product (admin) |
| GET | `/admin/users` | List users (admin) |
| PATCH | `/admin/users/:id/role` | Update role (admin) |

## Main Project Structure

```
├── backend/
│   ├── server.js          # Express API + static frontend
│   ├── users.db           # SQLite
│   ├── initDb.js
│   ├── seedTempAdmin.js
│   ├── makeAdmin.js
│   └── checkUsers.js
├── index.html
├── products.html
├── cart.html
├── login.html
├── orders.html
├── order-detail.html
├── admin.html
├── cart-system.js
├── wishlist.js
└── package.json
```

## Security Notes (Submission / Deployment)

- Move JWT `SECRET` to environment variables (`.env`), and never commit real secrets.
- Do not expose real passwords in the README or any public repository.

## Legal and Technical Notes

- LEGO(R) is a trademark of the LEGO Group. This project is for educational/demo use.
- The cart is stored in **localStorage**. On **Checkout** (after login), order data is sent to the server and stored in SQLite. View orders in `orders.html` and order details in `order-detail.html?id=`.

---

**Capstone Project 2 — MIS for a Toy Store** · **PLAYARENA** (demo).
