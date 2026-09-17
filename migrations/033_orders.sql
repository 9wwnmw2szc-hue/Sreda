-- Orders / catalog solution (multi-tenant, additive).
CREATE TABLE product_category (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id)
);

CREATE TABLE product (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id),
  category_id uuid,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 8000),
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  compare_at_price numeric(12,2) CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  currency text NOT NULL DEFAULT 'RUB',
  sku text CHECK (sku IS NULL OR length(sku) BETWEEN 1 AND 64),
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  use_variants boolean NOT NULL DEFAULT false,
  track_inventory boolean NOT NULL DEFAULT false,
  availability text NOT NULL DEFAULT 'in_stock'
    CHECK (availability IN ('quantity', 'in_stock', 'made_to_order', 'out_of_stock')),
  stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  FOREIGN KEY (business_id, category_id) REFERENCES product_category (business_id, id)
);

CREATE TABLE product_image (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL,
  product_id uuid NOT NULL,
  attachment_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (product_id, attachment_id),
  FOREIGN KEY (business_id, product_id) REFERENCES product (business_id, id),
  FOREIGN KEY (business_id, attachment_id) REFERENCES attachment (business_id, id)
);

CREATE TABLE product_option_group (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL,
  product_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  position integer NOT NULL DEFAULT 0,
  UNIQUE (business_id, id),
  FOREIGN KEY (business_id, product_id) REFERENCES product (business_id, id)
);

CREATE TABLE product_option (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL,
  group_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  position integer NOT NULL DEFAULT 0,
  UNIQUE (business_id, id),
  FOREIGN KEY (business_id, group_id) REFERENCES product_option_group (business_id, id)
);

CREATE TABLE product_variant (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL,
  product_id uuid NOT NULL,
  option_ids jsonb NOT NULL DEFAULT '[]',
  label text NOT NULL DEFAULT '' CHECK (length(label) <= 200),
  sku text CHECK (sku IS NULL OR length(sku) BETWEEN 1 AND 64),
  price numeric(12,2) CHECK (price IS NULL OR price >= 0),
  availability text NOT NULL DEFAULT 'in_stock'
    CHECK (availability IN ('quantity', 'in_stock', 'made_to_order', 'out_of_stock')),
  stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  FOREIGN KEY (business_id, product_id) REFERENCES product (business_id, id)
);

CREATE TABLE cart (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id),
  client_id uuid,
  platform text NOT NULL CHECK (platform IN ('telegram', 'vk', 'web')),
  external_user_id text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, platform, external_user_id),
  FOREIGN KEY (business_id, client_id) REFERENCES client (business_id, id)
);

CREATE TABLE cart_item (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 999),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (cart_id, product_id, variant_id),
  FOREIGN KEY (business_id, cart_id) REFERENCES cart (business_id, id),
  FOREIGN KEY (business_id, product_id) REFERENCES product (business_id, id),
  FOREIGN KEY (business_id, variant_id) REFERENCES product_variant (business_id, id)
);

CREATE TABLE "order" (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id),
  client_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'accepted', 'assembling', 'ready', 'handed_over', 'delivered', 'completed', 'cancelled')),
  fulfillment text NOT NULL CHECK (fulfillment IN ('delivery', 'pickup')),
  customer_name text NOT NULL CHECK (length(trim(customer_name)) BETWEEN 1 AND 120),
  customer_phone text NOT NULL CHECK (length(trim(customer_phone)) BETWEEN 5 AND 32),
  delivery_address text NOT NULL DEFAULT '' CHECK (length(delivery_address) <= 500),
  comment text NOT NULL DEFAULT '' CHECK (length(comment) <= 2000),
  currency text NOT NULL DEFAULT 'RUB',
  total numeric(12,2) NOT NULL CHECK (total >= 0),
  items_snapshot jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('telegram', 'vk', 'web')),
  request_key text NOT NULL,
  request_hash text NOT NULL,
  conversation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, request_key),
  FOREIGN KEY (business_id, client_id) REFERENCES client (business_id, id)
);

CREATE TABLE order_item (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid,
  variant_id uuid,
  name text NOT NULL,
  variant_label text NOT NULL DEFAULT '',
  sku text,
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 999),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  UNIQUE (business_id, id),
  FOREIGN KEY (business_id, order_id) REFERENCES "order" (business_id, id)
);

CREATE TABLE order_status_history (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL,
  order_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor_user_id uuid REFERENCES "user"(id),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, order_id) REFERENCES "order" (business_id, id)
);

CREATE INDEX order_business_status ON "order" (business_id, status, created_at DESC);
CREATE INDEX product_business_category ON product (business_id, category_id, position, name);
