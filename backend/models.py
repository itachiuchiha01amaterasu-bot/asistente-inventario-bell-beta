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

    variants = db.relationship(
        "ProductVariant",
        backref="product",
        lazy=True,
        cascade="all, delete-orphan",
    )


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

    batches = db.relationship(
        "InventoryBatch",
        backref="variant",
        lazy=True,
        cascade="all, delete-orphan",
    )


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
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# -----------------------------
# Compras / Ventas directas
# -----------------------------
class Sale(db.Model):
    __tablename__ = "sales"

    id = db.Column(db.Integer, primary_key=True)

    # Se guardan datos del comprador aunque la cuenta se elimine después:
    # el historial de ventas no debe romperse.
    user_id = db.Column(db.Integer, nullable=True)
    username = db.Column(db.String(80), nullable=False)

    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())

    items = db.relationship(
        "SaleItem",
        backref="sale",
        lazy=True,
        cascade="all, delete-orphan",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "username": self.username,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "total_units": sum(item.quantity for item in self.items),
            "items": [item.to_dict() for item in self.items],
        }


class SaleItem(db.Model):
    __tablename__ = "sale_items"

    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=False)

    # Copia del producto al momento de la venta: si luego se edita o se
    # elimina del inventario, el historial sigue siendo legible.
    variant_id = db.Column(db.Integer, nullable=True)
    product_name = db.Column(db.String(200), nullable=False)
    brand = db.Column(db.String(120), nullable=True)
    type_variety = db.Column(db.String(200), nullable=True)
    content_value = db.Column(db.Float, nullable=True)
    content_unit = db.Column(db.String(20), nullable=True)

    quantity = db.Column(db.Integer, nullable=False)

    def to_dict(self):
        return {
            "variant_id": self.variant_id,
            "product_name": self.product_name,
            "brand": self.brand,
            "type_variety": self.type_variety,
            "content_value": self.content_value,
            "content_unit": self.content_unit,
            "quantity": self.quantity,
        }