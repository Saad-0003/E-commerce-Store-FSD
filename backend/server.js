const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;
const DB = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "alto_store",
};

let pool = null;
const memoryStore = { configurations: [], orders: [] };

const PRODUCTS = [
  { id: 1, name: "Alto Insulated Bottle", category: "Drinkware", price: 34, description: "Double-wall steel, cold 24h / hot 12h." },
  { id: 2, name: "Alto Travel Tumbler", category: "Drinkware", price: 27, description: "Spill-proof lid, fits car cup holders." },
  { id: 3, name: "Alto Bottle Sleeve", category: "Accessories", price: 12, description: "Neoprene sleeve with carry strap." },
  { id: 4, name: "Alto Cleaning Brush Set", category: "Accessories", price: 9, description: "Long brush and straw brush set." },
];

const SIZE_PRICES = { 500: 29, 750: 34, 1000: 39 };
const FREE_COLORS = ["midnight", "ocean", "forest", "sunset"];
const PREMIUM_COLORS = ["gold", "rose", "titanium"];
const STYLES = ["standard", "script", "mono"];
const PREMIUM_SURCHARGE = 5;
const MAX_ENGRAVING = 20;

async function connectDatabase() {
  let admin;
  try {
    admin = await mysql.createConnection({
      host: DB.host,
      port: DB.port,
      user: DB.user,
      password: DB.password,
    });
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${DB.database}\``);
    await admin.end();
    admin = null;

    pool = mysql.createPool({ ...DB, waitForConnections: true, connectionLimit: 5 });
    await pool.query(`CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      category VARCHAR(60) NOT NULL,
      description VARCHAR(255) NOT NULL,
      price DECIMAL(8,2) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(60) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS configurations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_name VARCHAR(80) NOT NULL,
      color VARCHAR(20) NOT NULL,
      variant INT NOT NULL,
      engraving VARCHAR(20) NOT NULL,
      engraving_style VARCHAR(20) NOT NULL,
      shine TINYINT(1) NOT NULL DEFAULT 0,
      is_premium TINYINT(1) NOT NULL DEFAULT 0,
      customer_name VARCHAR(60) NOT NULL DEFAULT '',
      customer_email VARCHAR(254) NOT NULL DEFAULT '',
      price DECIMAL(8,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const [emailColumn] = await pool.query("SHOW COLUMNS FROM configurations LIKE 'customer_email'");
    if (!emailColumn.length) {
      await pool.query("ALTER TABLE configurations ADD COLUMN customer_email VARCHAR(254) NOT NULL DEFAULT ''");
    }
    await pool.query(`CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id INT NOT NULL,
      total_amount DECIMAL(10,2) NOT NULL,
      status ENUM('placed', 'processing', 'completed', 'cancelled') NOT NULL DEFAULT 'placed',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      product_id INT NULL,
      item_type ENUM('bottle', 'addon') NOT NULL,
      title VARCHAR(120) NOT NULL,
      detail VARCHAR(255) NOT NULL DEFAULT '',
      quantity INT NOT NULL DEFAULT 1,
      unit_price DECIMAL(8,2) NOT NULL,
      color VARCHAR(20) NULL,
      variant INT NULL,
      engraving VARCHAR(20) NULL,
      engraving_style VARCHAR(20) NULL,
      shine TINYINT(1) NOT NULL DEFAULT 0,
      is_premium TINYINT(1) NOT NULL DEFAULT 0,
      CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    )`);

    for (const product of PRODUCTS) {
      await pool.query(
        `INSERT INTO products (id, name, category, description, price)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category),
           description = VALUES(description), price = VALUES(price), active = 1`,
        [product.id, product.name, product.category, product.description, product.price]
      );
    }
    console.log(`MySQL connected: database "${DB.database}" is ready`);
  } catch (err) {
    if (admin) await admin.end();
    if (pool) await pool.end();
    pool = null;
    console.warn("MySQL not available (" + err.code + "). Start MySQL in XAMPP. Using in-memory storage for now.");
  }
}

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

function normalizeConfiguration(input) {
  const c = input && typeof input === "object" ? input : {};
  const color = typeof c.color === "string" ? c.color : "";
  const variant = Number(c.variant);
  const engraving = typeof c.engraving === "string" ? c.engraving.trim() : "";
  const style = typeof c.engravingStyle === "string" ? c.engravingStyle : "standard";
  const shine = c.shine === true;
  const isPremium = c.isPremium === true;
  const errors = [];

  if (!FREE_COLORS.includes(color) && !PREMIUM_COLORS.includes(color)) errors.push("Unknown color.");
  if (!SIZE_PRICES[variant]) errors.push("Variant must be 500, 750 or 1000.");
  if (!STYLES.includes(style)) errors.push("Unknown engraving style.");
  if (engraving.length > MAX_ENGRAVING) errors.push(`Engraving is limited to ${MAX_ENGRAVING} characters.`);
  if ((PREMIUM_COLORS.includes(color) || style !== "standard" || shine) && !isPremium) {
    errors.push("Premium options require a Premium account.");
  }
  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.status = 400;
    throw error;
  }

  const customerName = typeof c.customerName === "string" ? c.customerName.trim() : "";
  const customerEmail = typeof c.customerEmail === "string" ? c.customerEmail.trim() : "";
  if (customerName.length > 60) {
    const error = new Error("Name must be 60 characters or fewer.");
    error.status = 400;
    throw error;
  }
  if (customerEmail && (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))) {
    const error = new Error("Enter a valid email address.");
    error.status = 400;
    throw error;
  }
  if (Boolean(customerName) !== Boolean(customerEmail)) {
    const error = new Error("Enter both your name and email to save customer details.");
    error.status = 400;
    throw error;
  }

  return {
    productName: "Alto Insulated Bottle",
    color,
    variant,
    engraving: engraving || "No engraving",
    engravingStyle: style,
    shine,
    isPremium,
    customerName,
    customerEmail,
    price: SIZE_PRICES[variant] + (PREMIUM_COLORS.includes(color) ? PREMIUM_SURCHARGE : 0),
  };
}

function validateOrder(body) {
  const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
  const customerEmail = typeof body.customerEmail === "string" ? body.customerEmail.trim() : "";
  if (customerName.length < 2 || customerName.length > 60 || /\d/.test(customerName)) {
    const error = new Error("Enter your full name (2 to 60 characters, no numbers).");
    error.status = 400;
    throw error;
  }
  if (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    const error = new Error("Enter a valid email address.");
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    const error = new Error("Your order must contain between 1 and 20 items.");
    error.status = 400;
    throw error;
  }

  const items = body.items.map((item) => {
    if (item && item.type === "bottle") {
      const config = normalizeConfiguration({ ...item, customerName: "", customerEmail: "" });
      return { ...config, type: "bottle", title: config.productName, detail: item.detail || "", productId: 1 };
    }
    const title = item && typeof item.title === "string" ? item.title.trim() : "";
    const detail = item && typeof item.detail === "string" ? item.detail.trim() : "";
    const price = Number(item && item.price);
    if (!title || title.length > 120 || detail.length > 255 || !Number.isFinite(price) || price <= 0 || price > 10000) {
      const error = new Error("An add-on has invalid product details or price.");
      error.status = 400;
      throw error;
    }
    return { type: "addon", title, detail, price, productId: null };
  });
  return { customerName, customerEmail, items, total: items.reduce((sum, item) => sum + item.price, 0) };
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", storage: pool ? "mysql" : "memory" });
});

app.get("/api/products", async (req, res, next) => {
  try {
    if (!pool) return res.json({ count: PRODUCTS.length, products: PRODUCTS, storage: "memory" });
    const [products] = await pool.query(
      "SELECT id, name, category, description, price FROM products WHERE active = 1 ORDER BY id"
    );
    const result = products.map((product) => ({ ...product, price: Number(product.price) }));
    res.json({ count: result.length, products: result, storage: "mysql" });
  } catch (err) {
    next(err);
  }
});

app.get("/api/configurations", async (req, res, next) => {
  try {
    if (!pool) {
      const configurations = [...memoryStore.configurations].reverse().slice(0, 20);
      return res.json({ storage: "memory", count: configurations.length, configurations });
    }
    const [configurations] = await pool.query(
      `SELECT id, product_name, color, variant, engraving, engraving_style, shine,
        is_premium, customer_name, price, created_at
       FROM configurations ORDER BY id DESC LIMIT 20`
    );
    res.json({ storage: "mysql", count: configurations.length, configurations });
  } catch (err) {
    next(err);
  }
});

app.post("/api/configurations", async (req, res, next) => {
  try {
    const configuration = normalizeConfiguration(req.body);
    if (pool) {
      const [result] = await pool.query(
        `INSERT INTO configurations
          (product_name, color, variant, engraving, engraving_style, shine, is_premium,
           customer_name, customer_email, price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [configuration.productName, configuration.color, configuration.variant, configuration.engraving,
          configuration.engravingStyle, configuration.shine ? 1 : 0, configuration.isPremium ? 1 : 0,
          configuration.customerName, configuration.customerEmail, configuration.price]
      );
      configuration.id = result.insertId;
    } else {
      configuration.id = memoryStore.configurations.length + 1;
      configuration.created_at = new Date().toISOString();
      memoryStore.configurations.push(configuration);
    }
    res.status(201).json({
      message: "Configuration saved successfully",
      storage: pool ? "mysql" : "memory",
      configuration,
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/orders", async (req, res, next) => {
  try {
    if (!pool) {
      const orders = [...memoryStore.orders].reverse().slice(0, 20);
      return res.json({ storage: "memory", count: orders.length, orders });
    }
    const [orders] = await pool.query(
      "SELECT id, total_amount, status, created_at FROM orders ORDER BY id DESC LIMIT 20"
    );
    res.json({
      storage: "mysql",
      count: orders.length,
      orders: orders.map((order) => ({ ...order, total_amount: Number(order.total_amount) })),
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/orders", async (req, res, next) => {
  let connection;
  try {
    const order = validateOrder(req.body || {});
    let savedOrder;
    if (pool) {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      await connection.query(
        "INSERT INTO customers (name, email) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
        [order.customerName, order.customerEmail]
      );
      const [[customer]] = await connection.query("SELECT id FROM customers WHERE email = ?", [order.customerEmail]);
      const [orderResult] = await connection.query(
        "INSERT INTO orders (customer_id, total_amount) VALUES (?, ?)",
        [customer.id, order.total]
      );
      for (const item of order.items) {
        await connection.query(
          `INSERT INTO order_items
            (order_id, product_id, item_type, title, detail, unit_price, color, variant,
             engraving, engraving_style, shine, is_premium)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderResult.insertId, item.productId, item.type, item.title, item.detail || "", item.price,
            item.type === "bottle" ? item.color : null, item.type === "bottle" ? item.variant : null,
            item.type === "bottle" ? item.engraving : null,
            item.type === "bottle" ? item.engravingStyle : null,
            item.type === "bottle" && item.shine ? 1 : 0,
            item.type === "bottle" && item.isPremium ? 1 : 0]
        );
      }
      await connection.commit();
      savedOrder = { id: orderResult.insertId, total: order.total, status: "placed" };
    } else {
      savedOrder = { id: memoryStore.orders.length + 1, total: order.total, status: "placed", created_at: new Date().toISOString() };
      memoryStore.orders.push(savedOrder);
    }
    res.status(201).json({
      message: "Order placed and saved successfully",
      storage: pool ? "mysql" : "memory",
      order: savedOrder,
    });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
});

app.use((req, res) => res.status(404).json({ error: `Cannot ${req.method} ${req.url}` }));

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Request body is not valid JSON." });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Server error." });
});

connectDatabase().then(() => {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});
