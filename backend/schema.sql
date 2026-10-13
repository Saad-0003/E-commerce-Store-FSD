CREATE DATABASE IF NOT EXISTS alto_store
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE alto_store;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(60) NOT NULL,
  description VARCHAR(255) NOT NULL,
  price DECIMAL(8,2) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS configurations (
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
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status ENUM('placed', 'processing', 'completed', 'cancelled') NOT NULL DEFAULT 'placed',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS order_items (
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
);

INSERT INTO products (id, name, category, description, price, active) VALUES
  (1, 'Alto Insulated Bottle', 'Drinkware', 'Double-wall steel, cold 24h / hot 12h.', 34.00, 1),
  (2, 'Alto Travel Tumbler', 'Drinkware', 'Spill-proof lid, fits car cup holders.', 27.00, 1),
  (3, 'Alto Bottle Sleeve', 'Accessories', 'Neoprene sleeve with carry strap.', 12.00, 1),
  (4, 'Alto Cleaning Brush Set', 'Accessories', 'Long brush and straw brush set.', 9.00, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category = VALUES(category),
  description = VALUES(description),
  price = VALUES(price),
  active = VALUES(active);
