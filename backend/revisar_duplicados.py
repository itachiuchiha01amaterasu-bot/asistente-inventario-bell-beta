"""Revisa posibles duplicados en la base (solo lectura, no cambia nada).

Uso:

    read -rsp "Pega la URL de la base: " DBURL; echo
    DATABASE_URL="$DBURL" python3 -m backend.revisar_duplicados

Busca nombres que son el mismo pero escritos distinto (mayúsculas, tildes
o espacios) en rubros, marcas, productos y variantes. También muestra los
lotes de cada variante para comparar los números.

Este script NO modifica ni borra nada: solo informa. Así se puede revisar
producción sin riesgo.
"""
import os
import sys
from collections import defaultdict

from backend.ejecutar import clave_nombre

# La URL se exige antes de importar la app, para no tocar la base local
# definida en backend/.env por error.
if not os.environ.get("DATABASE_URL"):
    print("✗ Falta DATABASE_URL.")
    print("  Así se ejecuta (la URL no se guarda en el historial):")
    print('    read -rsp "Pega la URL de la base: " DBURL; echo')
    print('    DATABASE_URL="$DBURL" python3 -m backend.revisar_duplicados')
    sys.exit(1)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app import app  # noqa: E402  (también ejecuta db.create_all())
from backend.models import (  # noqa: E402
    db,
    Brand,
    Category,
    Product,
    ProductVariant,
)


def agrupar(filas, clave):
    grupos = defaultdict(list)
    for fila in filas:
        grupos[clave(fila)].append(fila)
    return {k: v for k, v in grupos.items() if len(v) > 1}


def main():
    with app.app_context():
        url = db.engine.url.render_as_string(hide_password=True)
        print(f"Base de datos: {url}\n")

        problemas = 0

        # ---------- Rubros ----------
        dup_categorias = agrupar(Category.query.all(), lambda c: clave_nombre(c.name))
        if dup_categorias:
            problemas += 1
            print("⚠ Rubros repetidos (mismo nombre escrito distinto):")
            for grupo in dup_categorias.values():
                print(f"  - {', '.join(repr(c.name) + f' (id {c.id})' for c in grupo)}")
            print()

        # ---------- Marcas ----------
        dup_marcas = agrupar(Brand.query.all(), lambda m: clave_nombre(m.name))
        if dup_marcas:
            problemas += 1
            print("⚠ Marcas repetidas:")
            for grupo in dup_marcas.values():
                print(f"  - {', '.join(repr(m.name) + f' (id {m.id})' for m in grupo)}")
            print()

        # ---------- Productos ----------
        dup_productos = agrupar(
            Product.query.all(),
            lambda p: (clave_nombre(p.name), p.category_id),
        )
        if dup_productos:
            problemas += 1
            print("⚠ Productos repetidos (mismo rubro):")
            for grupo in dup_productos.values():
                categoria = grupo[0].category.name if grupo[0].category else "sin rubro"
                print(
                    f"  - {', '.join(repr(p.name) + f' (id {p.id})' for p in grupo)}"
                    f"  · rubro: {categoria}"
                )
            print()

        # ---------- Variantes visibles en el inventario ----------
        todas = ProductVariant.query.all()
        claves = {}

        for v in todas:
            producto = v.product.name if v.product else "?"
            marca = v.brand.name if v.brand else "Sin marca"
            contenido = (
                f"{v.content_value:g} {v.content_unit}"
                if v.content_value is not None and v.content_unit
                else "Por definir"
            )
            clave = (
                clave_nombre(producto),
                v.product.category_id if v.product else None,
                clave_nombre(marca),
                v.content_value,
                (v.content_unit or "").upper(),
                clave_nombre(v.type_variety),
            )
            claves.setdefault(clave, []).append(v)

        dup_variantes = {k: g for k, g in claves.items() if len(g) > 1}
        if dup_variantes:
            problemas += 1
            print("⚠ Variantes repetidas (mismo producto, marca y contenido):")
            for grupo in dup_variantes.values():
                v0 = grupo[0]
                print(
                    f"  - {v0.product.name} · {v0.brand.name if v0.brand else 'Sin marca'}"
                    f" · {v0.type_variety or 'sin variedad'}"
                    f" · {v0.content_value} {v0.content_unit}"
                )
                for v in grupo:
                    lotes = sorted(v.batches, key=lambda l: (l.arrival_date, l.id))
                    detalle = ", ".join(
                        f"Lote #{l.id} ({l.quantity} u, "
                        f"vence {l.expiration_date or 'sin fecha'})"
                        for l in lotes
                    ) or "sin lotes"
                    print(f"      variante id {v.id}: {detalle}")
            print()

        # ---------- Variantes sin variedad junto a una con variedad ----------
        posibles = defaultdict(list)
        for v in todas:
            if not v.product or not v.brand:
                continue
            clave = (
                clave_nombre(v.product.name),
                v.product.category_id,
                clave_nombre(v.brand.name),
                v.content_value,
                (v.content_unit or "").upper(),
            )
            posibles[clave].append(v)

        mezcladas = []
        for grupo in posibles.values():
            if len(grupo) < 2:
                continue
            con = [v for v in grupo if clave_nombre(v.type_variety)]
            sin = [v for v in grupo if not clave_nombre(v.type_variety)]
            if con and sin:
                mezcladas.append((con, sin))

        if mezcladas:
            print("ℹ Variantes del mismo producto donde una no tiene variedad:")
            for con, sin in mezcladas:
                print(
                    f"  - con variedad: {', '.join(v.type_variety for v in con)}; "
                    f"sin variedad: variante(s) id "
                    f"{', '.join(str(v.id) for v in sin)}"
                )
            print("  (Puede ser correcto si son productos distintos; revisar antes de unir.)")
            print()

        if problemas == 0:
            print("✓ No se encontraron duplicados por mayúsculas, tildes ni espacios.")
        else:
            print(
                "Total de grupos con posible duplicado: "
                f"{problemas}. Este informe no cambió nada."
            )

    return 0


if __name__ == "__main__":
    sys.exit(main())
