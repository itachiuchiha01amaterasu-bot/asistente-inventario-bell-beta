import re
import unicodedata

from datetime import datetime, date
from backend.models import db, Category, Brand, Product, ProductVariant, InventoryBatch

opciones_pendientes = {}


def clave_nombre(texto):
    """Clave para comparar nombres sin distinguir mayúsculas, tildes ni espacios.

    "Leche", "leche" y "  LECHE " deben ser el mismo producto: si no, cada
    variante escrita de otra forma creaba una fila nueva en el inventario.
    """
    if texto is None:
        return ""

    limpio = unicodedata.normalize("NFKD", str(texto))
    limpio = "".join(c for c in limpio if not unicodedata.combining(c))
    return " ".join(limpio.lower().split())


def _buscar_por_nombre(modelo, nombre):
    """Devuelve la primera fila cuyo nombre coincida, sin distinguir forma."""
    clave = clave_nombre(nombre)
    if not clave:
        return None

    for fila in modelo.query.order_by(modelo.id.asc()).all():
        if clave_nombre(fila.name) == clave:
            return fila

    return None

def normalizar_cantidad(valor):
    try:
        return int(valor)
    except:
        return 0


def normalizar_contenido(valor, unidad_raw):
    if valor in ["Por definir", None, ""]:
        return None, None

    try:
        v = float(valor)
    except:
        return None, None

    u = (unidad_raw or "").strip().lower()

    if u in ["litro", "litros", "l"]:
        return v, "L"
    if u in ["kg", "kilo", "kilos", "kilogramo", "kilogramos"]:
        return v, "kg"
    if u in ["gramo", "gramos", "g"]:
        return v, "g"
    if u in ["ml", "mililitro", "mililitros"]:
        return v, "ml"

    return v, unidad_raw


def parsear_precio(valor):
    """Convierte un precio escrito de varias formas a número.

    Acepta "", "$ 1.500,50", "1500.5", "1,500.50", etc. Devuelve
    (precio, error): precio None significa "sin precio".
    """
    if valor is None:
        return None, None

    texto = str(valor).strip()
    if not texto:
        return None, None

    texto = texto.replace("$", "").strip()
    # Se quita el nombre de la moneda antes de eliminar los espacios, para
    # que "1500 ARS" no termine como "1500ARS" (sin límite de palabra).
    texto = re.sub(
        r"(?i)(?<![a-z])(ars|usd|eur|bs|bolivares|bolívares|pesos?)(?![a-z])",
        "",
        texto,
    ).strip()
    texto = texto.replace(" ", "")

    if "," in texto and "." in texto:
        # Formato español: 1.500,50 -> 1500.50 (o inglés: 1,500.50).
        if texto.rfind(",") > texto.rfind("."):
            texto = texto.replace(".", "").replace(",", ".")
        else:
            texto = texto.replace(",", "")
    elif "," in texto:
        texto = texto.replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", texto):
        # "1.500" se interpreta como mil quinientos, no como 1.5.
        texto = texto.replace(".", "")

    try:
        precio = float(texto)
    except (TypeError, ValueError):
        return None, "El precio debe ser un número mayor o igual a 0"

    if precio < 0:
        return None, "El precio no puede ser negativo"

    if precio > 9999999999.99:
        return None, "El precio es demasiado alto"

    return round(precio, 2), None


def precio_texto(precio):
    """Formato de precio para las respuestas del chat: $1.500,50."""
    if precio is None:
        return "Sin precio"

    texto = f"{float(precio):,.2f}"
    return "$" + texto.replace(",", "X").replace(".", ",").replace("X", ".")


def normalizar_fecha(valor):
    if not valor or str(valor).lower() in ["-", "por definir", "none", "null"]:
        return None

    texto = str(valor).strip()

    # Acepta 2026-12-20, 20/12/2026, 20-12-2026 y años de dos cifras.
    for formato in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y"):
        try:
            return datetime.strptime(texto, formato).date()
        except (TypeError, ValueError):
            continue

    return None


def obtener_o_crear_categoria(nombre):
    nombre = (nombre or "").strip()
    if not nombre or nombre == "Por definir":
        nombre = "General"

    cat = _buscar_por_nombre(Category, nombre)
    if not cat:
        cat = Category(name=nombre)
        db.session.add(cat)
        db.session.commit()
    return cat


def obtener_o_crear_marca(nombre):
    nombre = (nombre or "").strip()
    if not nombre or nombre == "Por definir":
        nombre = "Sin marca"

    marca = _buscar_por_nombre(Brand, nombre)
    if not marca:
        marca = Brand(name=nombre)
        db.session.add(marca)
        db.session.commit()
    return marca


def obtener_o_crear_producto(nombre, categoria):
    nombre = (nombre or "").strip()

    prod = _buscar_por_nombre(Product, nombre)
    if prod and prod.category_id == categoria.id:
        return prod

    # Mismo nombre pero en otro rubro: es otro producto.
    if prod:
        prod = (
            Product.query
            .filter_by(category_id=categoria.id)
            .filter(Product.name.ilike(nombre))
            .order_by(Product.id.asc())
            .first()
        )
        if prod:
            return prod

    prod = Product(name=nombre, category_id=categoria.id)
    db.session.add(prod)
    db.session.commit()
    return prod


def generar_sku(producto, marca, tipo_variedad, contenido_valor, contenido_unidad):
    nombre = (producto.name or "").replace(" ", "").upper()
    marca_txt = (marca.name if marca else "SINMARCA").replace(" ", "").upper()
    variedad_txt = (tipo_variedad or "").replace(" ", "").upper()
    contenido_txt = ""
    if contenido_valor is not None and contenido_unidad:
        contenido_txt = f"{contenido_valor}{contenido_unidad}".upper()

    categoria_txt = "GEN"
    if producto.category:
        categoria_txt = producto.category.name.replace(" ", "").upper()

    return f"{categoria_txt}-{nombre}-{marca_txt}-{variedad_txt}-{contenido_txt}"


def obtener_o_crear_variante(producto, marca, tipo_variedad, contenido_valor, contenido_unidad):
    contenido_valor, contenido_unidad = normalizar_contenido(contenido_valor, contenido_unidad)

    tipo_variedad = (tipo_variedad or "").strip()
    clave_variedad = clave_nombre(tipo_variedad)

    candidatas = (
        ProductVariant.query
        .filter_by(
            product_id=producto.id,
            brand_id=marca.id,
            content_value=contenido_valor,
            content_unit=contenido_unidad,
        )
        .order_by(ProductVariant.id.asc())
        .all()
    )

    variante = None

    if clave_variedad:
        # Misma variedad (aunque cambien mayúsculas o tildes).
        variante = next(
            (v for v in candidatas if clave_nombre(v.type_variety) == clave_variedad),
            None,
        )

        if not variante:
            # Si existe una variante sin variedad, se completa en vez de
            # crear otra fila igual en el inventario.
            variante = next(
                (v for v in candidatas if not clave_nombre(v.type_variety)),
                None,
            )
            if variante:
                variante.type_variety = tipo_variedad
    else:
        # Sin variedad indicada: se reutiliza la que ya existe para no
        # duplicar el producto.
        variante = candidatas[0] if candidatas else None

    if not variante:
        sku = generar_sku(
            producto, marca, tipo_variedad, contenido_valor, contenido_unidad
        )
        variante = ProductVariant(
            product_id=producto.id,
            brand_id=marca.id,
            type_variety=tipo_variedad,
            content_value=contenido_valor,
            content_unit=contenido_unidad,
            sku_code=sku
        )
        db.session.add(variante)
        db.session.commit()
    else:
        variante.sku_code = generar_sku(
            producto, marca, variante.type_variety, contenido_valor, contenido_unidad
        )
        db.session.commit()

    return variante


def resolver_variante(target, unico=False):
    nombre = target.get("product_name")
    marca = target.get("brand")
    categoria = target.get("category")
    variedad = target.get("type_variety")
    valor = target.get("content_value")
    unidad = target.get("content_unit")

    if not nombre:
        return None, "No se especificó el nombre del producto."

    productos = Product.query.filter(Product.name.ilike(f"%{nombre}%")).all()
    if not productos and not marca:
        # "cuanto queda de leche kaly": si no existe un producto llamado
        # "leche kaly", probar con "leche" como producto y "kaly" como marca.
        partes = nombre.split()
        if len(partes) > 1:
            posible_producto = " ".join(partes[:-1])
            posible_marca = partes[-1]
            candidatos = Product.query.filter(
                Product.name.ilike(f"%{posible_producto}%")
            ).all()
            marca_obj = Brand.query.filter(
                Brand.name.ilike(f"%{posible_marca}%")
            ).first()
            if candidatos and marca_obj:
                productos = candidatos
                marca = posible_marca

    if not productos:
        return None, "No existe el producto solicitado."

    # Buscar en las variantes de TODOS los productos que coinciden por nombre,
    # no solo en el primero (puede haber "Leche kaly" y "Leche don bom").
    ids_productos = [p.id for p in productos]
    variantes = ProductVariant.query.filter(
        ProductVariant.product_id.in_(ids_productos)
    )

    if marca:
        marca_obj = Brand.query.filter(Brand.name.ilike(f"%{marca}%")).first()
        if not marca_obj:
            return None, "La marca indicada no existe."
        variantes = variantes.filter_by(brand_id=marca_obj.id)

    if categoria:
        categoria_obj = Category.query.filter(Category.name.ilike(f"%{categoria}%")).first()
        if not categoria_obj:
            return None, "El rubro indicado no existe."
        # El rubro está en el producto, no en la variante: se filtra por la
        # relación para no inventar una columna que no existe.
        variantes = variantes.join(Product).filter(
            Product.category_id == categoria_obj.id
        )

    if variedad:
        variantes = variantes.filter(ProductVariant.type_variety.ilike(f"%{variedad}%"))

    if valor and unidad:
        variantes = variantes.filter_by(content_value=valor, content_unit=unidad)

    variantes = variantes.all()

    if not variantes:
        return None, "No existe una variante que coincida con la descripción."

    if len(variantes) > 1:
        exactas = [
            v for v in variantes
            if (valor is None or v.content_value == valor)
            and (unidad is None or v.content_unit == unidad)
        ]
        if len(exactas) == 1:
            return exactas[0], None
        if unico:
            opciones = ", ".join(
                v.sku_code or f"{v.product.name} {v.brand.name if v.brand else ''}".strip()
                for v in variantes[:6]
            )
            return None, (
                f"Hay varias variantes que coinciden: {opciones}. "
                "Indica marca, variedad o contenido para elegir una."
            )

    return variantes[0], None


def ejecutar_accion(contrato):

    lotes_huerfanos = InventoryBatch.query.filter_by(variant_id=None).all()
    if lotes_huerfanos:
        for lote in lotes_huerfanos:
            db.session.delete(lote)
        db.session.commit()

    action = contrato.get("action")
    target = contrato.get("target", {})
    batch = contrato.get("batch", {})
    changes = contrato.get("changes", {})
    option = contrato.get("option")


    if action == "add":
        categoria = obtener_o_crear_categoria(target.get("category"))
        marca = obtener_o_crear_marca(target.get("brand"))
        producto = obtener_o_crear_producto(target.get("product_name"), categoria)

        contenido_valor, contenido_unidad = normalizar_contenido(
            target.get("content_value"),
            target.get("content_unit")
        )

        variante = obtener_o_crear_variante(
            producto,
            marca,
            target.get("type_variety"),
            contenido_valor,
            contenido_unidad
        )

        precio, error_precio = parsear_precio(target.get("price"))
        if error_precio:
            return f"No entendí el precio. {error_precio}"

        if precio is not None:
            variante.price = precio

        arrival = normalizar_fecha(batch.get("arrival_date")) or date.today()

        lote = InventoryBatch(
            variant_id=variante.id,
            quantity=normalizar_cantidad(batch.get("quantity")),
            arrival_date=arrival,
            expiration_date=normalizar_fecha(batch.get("expiration_date"))
        )

        db.session.add(lote)
        db.session.commit()

        return (
            f"Producto agregado correctamente. Lote #{lote.id}. "
            f"SKU: {variante.sku_code}. "
            f"Precio: {precio_texto(variante.price)}"
        )


    if action == "query":
        # Consulta general: "cuantos productos hay", "que hay en el inventario".
        if not target.get("product_name"):
            productos = Product.query.order_by(Product.name.asc()).all()
            if not productos:
                return "El inventario está vacío."

            lineas = []
            total_variantes = 0
            total_unidades = 0

            for producto in productos:
                for variante in producto.variants:
                    total_variantes += 1
                    stock = sum(lote.quantity for lote in variante.batches)
                    total_unidades += stock
                    if len(lineas) < 50:
                        marca = variante.brand.name if variante.brand else "Sin marca"
                        contenido = (
                            f"{variante.content_value} {variante.content_unit}"
                            if variante.content_value
                            else "Por definir"
                        )
                        lineas.append(
                            f"- {producto.name} | Marca: {marca} | "
                            f"Variedad: {variante.type_variety or 'Sin variedad'} | "
                            f"Contenido: {contenido} | "
                            f"Precio: {precio_texto(variante.price)} | "
                            f"Stock: {stock} unidades"
                        )

            resumen = (
                f"Inventario: {len(productos)} producto(s), "
                f"{total_variantes} variante(s), "
                f"{total_unidades} unidad(es) en total."
            )
            detalle = "\n".join(lineas)
            if total_variantes > len(lineas):
                detalle += (
                    f"\n... y {total_variantes - len(lineas)} variante(s) más."
                )
            return f"{resumen}\n\n{detalle}" if detalle else resumen

        variante, error = resolver_variante(target)
        if error:
            return error

        lotes = (
            InventoryBatch.query
            .filter_by(variant_id=variante.id)
            # Mismo orden que el inventario: por número de lote.
            .order_by(InventoryBatch.id.asc())
            .all()
        )
        total = sum(l.quantity for l in lotes)

        texto_lotes = ""
        for l in lotes:
            texto_lotes += (
                f"- Lote #{l.id}: {l.quantity} unidades, "
                f"Ingreso: {l.arrival_date}, "
                f"Vence: {l.expiration_date or 'Sin fecha'}\n"
            )

        return (
            f"Producto: {variante.product.name}\n"
            f"Marca: {variante.brand.name if variante.brand else 'Sin marca'}\n"
            f"Variedad: {variante.type_variety or 'Sin variedad'}\n"
            f"Contenido: {variante.content_value} {variante.content_unit}\n"
            f"Precio: {precio_texto(variante.price)}\n"
            f"SKU: {variante.sku_code}\n\n"
            f"Lotes:\n{texto_lotes}\n"
            f"Total disponible: {total} unidades."
        )


    if action == "edit":
        variante, error = resolver_variante(target)
        if error:
            return f"No se encontró el producto o variante especificada. {error}"

        campo = changes.get("field")
        valor = changes.get("value")
        batch_info = contrato.get("batch", {})

        if valor in ["Por definir", None, ""]:
            if campo == "expiration_date":
                return (
                    "Necesito la fecha de vencimiento. "
                    "Escríbela como dd/mm/aaaa (ej: 20/12/2026)."
                )
            return "Necesito un valor para editar ese campo."

        regenerar_sku_flag = False
        lote_editado = None

        if campo == "brand":
            nueva_marca = obtener_o_crear_marca(valor)
            variante.brand_id = nueva_marca.id
            regenerar_sku_flag = True

        elif campo == "category":
            nueva_cat = obtener_o_crear_categoria(valor)
            # El rubro pertenece al producto, no a la variante.
            variante.product.category_id = nueva_cat.id
            regenerar_sku_flag = True

        elif campo == "product_name":
            nuevo_nombre = str(valor).strip()
            if not nuevo_nombre:
                return "Necesito el nuevo nombre del producto."

            variante.product.name = nuevo_nombre

            # El SKU incluye el nombre: se actualiza en todas las variantes.
            for hermana in variante.product.variants:
                hermana.sku_code = generar_sku(
                    hermana.product,
                    hermana.brand,
                    hermana.type_variety or "",
                    hermana.content_value,
                    hermana.content_unit,
                )

            regenerar_sku_flag = False

        elif campo == "type_variety":
            variante.type_variety = str(valor).strip()
            regenerar_sku_flag = True

        elif campo == "content":
            coincidencia = re.match(
                r"^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?\s*$", str(valor)
            )
            if not coincidencia:
                return (
                    "No entendí el contenido. "
                    "Escríbelo como '1.5 L' o '500 g'."
                )

            numero = float(coincidencia.group(1).replace(",", "."))
            unidad = coincidencia.group(2) or variante.content_unit
            if not unidad:
                return "Indica la unidad del contenido: L, ml, kg o g."

            numero, unidad = normalizar_contenido(numero, unidad)
            variante.content_value = numero
            variante.content_unit = unidad
            regenerar_sku_flag = True

        elif campo == "expiration_date":
            fecha_nueva = normalizar_fecha(valor)
            if not fecha_nueva:
                return (
                    "No entendí la fecha. "
                    "Escríbela como dd/mm/aaaa (ej: 20/12/2026)."
                )

            lote_id = batch_info.get("batch_id")
            if lote_id:
                lote = InventoryBatch.query.get(lote_id)
            else:
                lotes = list(variante.batches)
                if len(lotes) == 1:
                    lote = lotes[0]
                elif len(lotes) > 1:
                    detalle = ", ".join(f"#{l.id}" for l in lotes)
                    return (
                        f"{variante.product.name} tiene varios lotes: {detalle}. "
                        f"Indica cuál, por ejemplo: "
                        f"'cambia el vencimiento del lote {lotes[0].id} "
                        f"al 20/12/2026'."
                    )
                else:
                    return "Ese producto no tiene lotes registrados."

            if not lote or lote.variant_id != variante.id:
                return "No se encontró el lote indicado para ese producto."

            lote.expiration_date = fecha_nueva
            lote_editado = lote


        elif campo == "batch_quantity":
            lote_id = batch_info.get("batch_id")
            lotes = list(variante.batches)

            if lote_id:
                lote = next((l for l in lotes if l.id == lote_id), None)
            elif len(lotes) == 1:
                lote = lotes[0]
            elif len(lotes) > 1:
                detalle = ", ".join(f"#{l.id}" for l in lotes)
                return (
                    f"{variante.product.name} tiene varios lotes: {detalle}. "
                    f"Indica cuál, por ejemplo: "
                    f"'cambia la cantidad del lote {lotes[0].id} a 15'."
                )
            else:
                return "Ese producto no tiene lotes registrados."

            if not lote or lote.variant_id != variante.id:
                return "No se encontró el lote indicado para ese producto."

            try:
                cantidad = int(float(valor))
            except (TypeError, ValueError):
                return "Necesito una cantidad entera, por ejemplo: 15."

            if cantidad < 0:
                return "La cantidad no puede ser negativa."

            sumar = bool(changes.get("extra", {}).get("sumar"))
            lote.quantity = lote.quantity + cantidad if sumar else cantidad
            lote_editado = lote

        elif campo == "price":
            precio, error_precio = parsear_precio(valor)
            if error_precio:
                return f"No entendí el precio. {error_precio}"

            if precio is None:
                return (
                    "Necesito el precio nuevo, por ejemplo: "
                    "'ponle precio 1500 a la leche'."
                )

            variante.price = precio

        else:
            return f"El campo '{campo}' no es válido."

        if regenerar_sku_flag:
            variante.sku_code = generar_sku(
                variante.product,
                variante.brand,
                variante.type_variety or "",
                variante.content_value,
                variante.content_unit,
            )

        db.session.commit()

        if campo == "expiration_date" and lote_editado:
            return (
                f"Listo. El lote #{lote_editado.id} de "
                f"{variante.product.name} ahora vence el "
                f"{lote_editado.expiration_date.strftime('%d/%m/%Y')}."
            )

        if campo == "batch_quantity" and lote_editado:
            return (
                f"Listo. El lote #{lote_editado.id} de "
                f"{variante.product.name} ahora tiene "
                f"{lote_editado.quantity} unidades."
            )

        return (
            f"Edición completada para:\n"
            f"- Producto: {variante.product.name}\n"
            f"- Marca: {variante.brand.name if variante.brand else 'Sin marca'}\n"
            f"- Variedad: {variante.type_variety or 'Sin variedad'}\n"
            f"- Contenido: {variante.content_value} {variante.content_unit}\n"
            f"- Precio: {precio_texto(variante.price)}\n"
            f"SKU actualizado: {variante.sku_code}"
        )


    if action == "delete":
        variante, error = resolver_variante(target, unico=True)
        if error:
            return f"No se pudo eliminar: {error}"

        cantidad = normalizar_cantidad(batch.get("quantity"))
        producto_id = variante.product_id

        nombre = variante.product.name
        marca = variante.brand.name if variante.brand else "Sin marca"
        variedad = variante.type_variety or "Sin variedad"
        contenido = (
            f"{variante.content_value} {variante.content_unit}"
            if variante.content_value
            else "Por definir"
        )

        def eliminar_variante_y_producto_si_queda_vacio():
            """Borra la variante con sus lotes y el producto si ya no tiene variantes."""
            # Refrescar la colección evita reintentar borrar lotes ya eliminados.
            db.session.expire(variante, ["batches"])
            db.session.delete(variante)  # el cascade borra también sus lotes
            db.session.flush()

            if ProductVariant.query.filter_by(product_id=producto_id).count() == 0:
                producto = db.session.get(Product, producto_id)
                if producto:
                    db.session.delete(producto)

            db.session.commit()

        # Con un lote indicado ("elimina el lote 6") se borra solo ese lote,
        # o se descuentan unidades de ese lote.
        lote_objetivo_id = batch.get("batch_id")

        if lote_objetivo_id:
            lote = db.session.get(InventoryBatch, lote_objetivo_id)
            if not lote or lote.variant_id != variante.id:
                return "No se encontró el lote indicado para ese producto."

            unidades_antes = lote.quantity
            if cantidad <= 0 or cantidad >= unidades_antes:
                db.session.delete(lote)
                db.session.flush()
                borrado = True
            else:
                lote.quantity = unidades_antes - cantidad
                db.session.flush()
                borrado = False

            total = (
                db.session.query(
                    db.func.coalesce(db.func.sum(InventoryBatch.quantity), 0)
                )
                .filter(InventoryBatch.variant_id == variante.id)
                .scalar()
            )

            if total == 0:
                eliminar_variante_y_producto_si_queda_vacio()
                producto_existe = db.session.get(Product, producto_id) is not None
                final = (
                    "La variante fue eliminada."
                    if producto_existe
                    else "La variante y el producto fueron eliminados."
                )
                return (
                    f"Listo. Se eliminó el lote #{lote_objetivo_id} de "
                    f"{nombre} y ya no queda stock. {final}"
                )

            db.session.commit()

            if borrado:
                return (
                    f"Listo. Se eliminó el lote #{lote_objetivo_id} de "
                    f"{nombre} ({unidades_antes} unidades). "
                    f"Quedan {total} unidades en otros lotes."
                )

            return (
                f"Listo. Se descontaron {cantidad} unidades del lote "
                f"#{lote_objetivo_id} de {nombre}. "
                f"Quedan {total} unidades en total."
            )

        # Sin cantidad explícita ("elimina petipuas") se elimina todo.
        # Con cantidad ("elimina 2 unidades de leche") solo se descuenta stock.
        if cantidad <= 0:
            eliminar_variante_y_producto_si_queda_vacio()
            producto_existe = db.session.get(Product, producto_id) is not None

            if producto_existe:
                return (
                    f"Se eliminó la variante:\n"
                    f"- Producto: {nombre}\n"
                    f"- Marca: {marca}\n"
                    f"- Variedad: {variedad}\n"
                    f"- Contenido: {contenido}\n\n"
                    f"La variante fue eliminada."
                )

            return (
                f"Producto eliminado:\n"
                f"- Producto: {nombre}\n"
                f"- Marca: {marca}\n"
                f"- Variedad: {variedad}\n"
                f"- Contenido: {contenido}\n\n"
                f"La variante y el producto fueron eliminados."
            )

        restante = cantidad
        for lote in sorted(list(variante.batches), key=lambda l: l.arrival_date):
            if restante <= 0:
                break
            if lote.quantity <= restante:
                restante -= lote.quantity
                db.session.delete(lote)
            else:
                lote.quantity -= restante
                restante = 0

        db.session.flush()

        # Quitar lotes que hayan quedado en cero para no bloquear el borrado.
        for lote in list(variante.batches):
            if lote.quantity == 0:
                db.session.delete(lote)
        db.session.flush()

        total = (
            db.session.query(db.func.coalesce(db.func.sum(InventoryBatch.quantity), 0))
            .filter(InventoryBatch.variant_id == variante.id)
            .scalar()
        )

        if total == 0:
            eliminar_variante_y_producto_si_queda_vacio()
            producto_existe = db.session.get(Product, producto_id) is not None
            if producto_existe:
                return (
                    f"Se eliminaron todas las unidades de:\n"
                    f"- Producto: {nombre}\n"
                    f"- Marca: {marca}\n"
                    f"- Variedad: {variedad}\n"
                    f"- Contenido: {contenido}\n\n"
                    f"La variante fue eliminada."
                )
            return (
                f"Se eliminaron todas las unidades de:\n"
                f"- Producto: {nombre}\n"
                f"- Marca: {marca}\n"
                f"- Variedad: {variedad}\n"
                f"- Contenido: {contenido}\n\n"
                f"La variante y el producto fueron eliminados."
            )

        db.session.commit()
        return (
            f"Eliminación completada para:\n"
            f"- Producto: {nombre}\n"
            f"- Marca: {marca}\n"
            f"- Variedad: {variedad}\n"
            f"- Contenido: {contenido}\n\n"
            f"Cantidad restante: {total}."
        )


    if action == "select":
        clave = target.get("product_name")
        if clave not in opciones_pendientes:
            return "No hay selección pendiente."

        lista = opciones_pendientes[clave]

        if option.isdigit():
            idx = int(option)
            if 1 <= idx <= len(lista):
                variante = lista[idx - 1]
            else:
                return "Número inválido."
        else:
            variante = next((v for v in lista if option.lower() in v.sku_code.lower()), None)

        if not variante:
            return "No encontré coincidencias."

        del opciones_pendientes[clave]

        return f"Variante seleccionada: {variante.sku_code}"

    return "No entendí tu solicitud."
