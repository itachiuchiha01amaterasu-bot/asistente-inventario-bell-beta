from flask_sqlalchemy import SQLAlchemy
from datetime import date

db = SQLAlchemy()

# -----------------------------
# Categorías
# -----------------------------
class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)

    products = db.relationship("Product", backref="category", lazy=True)


# -----------------------------
# Marcas
# -----------------------------
class Brand(db.Model):
    __tablename__ = "brands"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)

    variants = db.relationship("ProductVariant", backref="brand", lazy=True)


# -----------------------------
# Producto base (Catálogo Maestro)
# -----------------------------
class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)

    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)

    variants = db.relationship("ProductVariant", backref="product", lazy=True)


# -----------------------------
# Variantes / SKU
# -----------------------------
class ProductVariant(db.Model):
    __tablename__ = "product_variants"

    id = db.Column(db.Integer, primary_key=True)

    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    brand_id = db.Column(db.Integer, db.ForeignKey("brands.id"), nullable=False)

    type_variety = db.Column(db.String(200), nullable=True)

    content_value = db.Column(db.Float, nullable=True)
    content_unit = db.Column(db.String(20), nullable=True)

    sku_code = db.Column(db.String(200), unique=True, nullable=True)

    batches = db.relationship("InventoryBatch", backref="variant", lazy=True)


# -----------------------------
# Lotes / Ingresos
# -----------------------------
class InventoryBatch(db.Model):
    __tablename__ = "inventory_batches"

    id = db.Column(db.Integer, primary_key=True)

    variant_id = db.Column(db.Integer, db.ForeignKey("product_variants.id"), nullable=False)

    quantity = db.Column(db.Integer, nullable=False)

    arrival_date = db.Column(db.Date, nullable=False, default=date.today)
    expiration_date = db.Column(db.Date, nullable=True)

# -----------------------------
# Usuarios y Roles
# -----------------------------
from werkzeug.security import generate_password_hash, check_password_hash

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="user")  # super_admin, admin, user
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "role": self.role
        }