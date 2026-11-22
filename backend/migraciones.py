"""Cambios de esquema que `db.create_all()` no puede aplicar solo.

`create_all()` crea tablas nuevas, pero no agrega columnas a tablas que ya
existen. Al desplegar una versión nueva sobre una base con datos hay que
agregar las columnas que faltan; este módulo lo hace de forma idempotente.
"""

from sqlalchemy import inspect, text

from backend.models import db


# tabla -> {columna: tipo SQL}
COLUMNAS_NUEVAS = {
    "product_variants": {
        "price": "NUMERIC(12, 2)",
    },
    "sale_items": {
        "unit_price": "NUMERIC(12, 2)",
    },
}


def asegurar_columnas():
    """Agrega solo las columnas que falten. Se puede ejecutar siempre."""
    try:
        inspector = inspect(db.engine)
        tablas = set(inspector.get_table_names())
    except Exception as e:
        print("No se pudo inspeccionar la base para migrar:", e)
        return

    for tabla, columnas in COLUMNAS_NUEVAS.items():
        if tabla not in tablas:
            # La tabla todavía no existe: create_all la creará completa.
            continue

        try:
            existentes = {
                columna["name"] for columna in inspector.get_columns(tabla)
            }
        except Exception as e:
            print(f"No se pudieron leer las columnas de {tabla}:", e)
            continue

        for nombre, tipo in columnas.items():
            if nombre in existentes:
                continue

            try:
                db.session.execute(
                    text(f"ALTER TABLE {tabla} ADD COLUMN {nombre} {tipo}")
                )
                db.session.commit()
                print(f"Columna agregada: {tabla}.{nombre}")
            except Exception as e:
                # Si otro proceso la agregó al mismo tiempo, no es un error
                # grave: se continúa con el arranque.
                db.session.rollback()
                print(f"No se pudo agregar {tabla}.{nombre}:", e)
