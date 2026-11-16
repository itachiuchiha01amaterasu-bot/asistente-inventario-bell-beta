# 💬 Guía de peticiones por el chat de IA

Esta guía reúne **todo lo que puedes pedirle a Bell por el chat** y ejemplos
que funcionan tal cual.

> ⚠️ **Importante:** cada mensaje se interpreta por separado. El chat no
> recuerda el mensaje anterior, así que **incluye siempre el producto y la
> marca** en cada petición.

---

## 1. Permisos según el rol

| Rol | Puede consultar | Puede agregar / editar / eliminar |
|-----|-----------------|-----------------------------------|
| `user` | ✅ Sí | ❌ No (el servidor lo bloquea) |
| `admin` | ✅ Sí | ✅ Sí |
| `super_admin` | ✅ Sí | ✅ Sí |

Si tu cuenta es de solo consulta, el chat responderá que pidas el cambio a un
administrador.

---

## 2. Formatos de fecha aceptados

Puedes escribir la fecha de cualquiera de estas formas:

- `20/12/2026`
- `20-12-2026`
- `20/12/26`
- `2026-12-20`

Las fechas que escribes **mandan sobre la IA**. Si indicas dos fechas, la que
acompaña a “vence” es el vencimiento y la que acompaña a “ingresó” es el
ingreso.

Para que el alta tome bien ambas fechas, usa las palabras **“ingresó”** y
**“vence”**.

---

## 3. Consultas (no modifican nada)

Sirven para cualquier rol.

| Qué quieres saber | Ejemplo de mensaje |
|-------------------|--------------------|
| Stock de un producto | `¿Cuánto queda de leche?` |
| Stock de un producto y marca | `¿Cuánto queda de leche de la marca Bell?` |
| Detalle con lotes y vencimientos | `Muéstrame los lotes de leche de la marca Bell` |
| Inventario completo | `Muéstrame el inventario` |
| Cantidad de productos | `¿Cuántos productos hay?` |
| Producto filtrando por rubro | `¿Cuánto queda de aceite de girasol del rubro Aceites?` |

Las consultas simples se responden **sin gastar cuota de IA**. Las consultas
más elaboradas sí usan el modelo.

La respuesta de una consulta detallada muestra:

- Producto, marca, variedad, contenido y SKU.
- Cada lote con su número, unidades, fecha de ingreso y vencimiento.
- Total disponible.

---

## 4. Alta de un producto (con rubro, marca, variedad, contenido, cantidad y fechas)

### Alta completa (recomendada)

```text
agrega 12 unidades de aceite de girasol marca Cocinero del rubro Aceites, variedad refinado, contenido 1.5 L, ingreso el 10/01/2026 y vence el 20/12/2026
```

Esto registra:

| Dato | Valor del ejemplo |
|------|-------------------|
| Producto | Aceite de girasol |
| Marca | Cocinero |
| Rubro | Aceites |
| Variedad | refinado |
| Contenido | 1.5 L |
| Cantidad | 12 unidades |
| Fecha de ingreso | 10/01/2026 |
| Fecha de vencimiento | 20/12/2026 |

La respuesta es similar a:

```text
Producto agregado correctamente. Lote #12. SKU: ACEITES-ACEITEDEGIRASOL-COCINERO-REFINADO-1.5L
```

El número de lote (`#12`) queda fijo y no cambia al editar el producto.

### Alta con pocos datos

Si no indicas algún dato, se completa así:

| Dato faltante | Valor que se usa |
|---------------|------------------|
| Marca | `Sin marca` |
| Rubro | `General` |
| Variedad | Sin variedad |
| Contenido | Por definir |
| Fecha de ingreso | Fecha de hoy |
| Fecha de vencimiento | Sin fecha |

Ejemplo:

```text
agrega 10 unidades de yerba Playadito del rubro Alimentos
```

### Agregar otro lote de un producto que ya existe

Vuelve a usar `agrega` con los mismos datos del producto. Se reutiliza la
variante y se crea **un lote nuevo**:

```text
agrega 8 unidades de leche Bell entera de 1 L del rubro Lacteos, ingreso el 05/02/2026 y vence el 05/03/2026
```

### Diferencia entre “agrega” y “suma”

- **`agrega ... unidades`** → crea un **lote nuevo**.
- **`suma ... unidades`** → aumenta la cantidad del **lote existente**.

```text
suma 5 unidades a leche de la marca Bell
```

Si el producto tiene varios lotes, indica cuál:

```text
suma 5 unidades al lote 3 de leche de la marca Bell
```

---

## 5. Edición de datos

### Tabla rápida de ediciones

| Qué quieres cambiar | Ejemplo de mensaje |
|---------------------|--------------------|
| Marca | `cambia la marca de leche Bell a Kaly` |
| Rubro | `cambia el rubro de leche Kaly a Bebidas` |
| Nombre del producto | `cambia el nombre de leche Kaly a Leche Entera` |
| Variedad | `cambia la variedad de leche Kaly a Descremada` |
| Contenido | `cambia el contenido de leche Kaly a 1.5 L` |
| Contenido en gramos | `cambia el contenido de leche Kaly a 500 g` |
| Cantidad (un solo lote) | `cambia la cantidad de leche Kaly a 15` |
| Cantidad de un lote | `cambia la cantidad del lote 3 de leche Kaly a 15` |
| Sumar unidades | `suma 5 unidades a leche Kaly` |
| Sumar a un lote | `suma 5 unidades al lote 3 de leche Kaly` |
| Vencimiento (un solo lote) | `cambia el vencimiento de leche Kaly al 20/12/2026` |
| Vencimiento de un lote | `cambia el vencimiento del lote 3 de leche Kaly al 20/12/2026` |

### Reglas importantes al editar

1. Usa el **nombre y la marca actuales**. Si acabas de cambiar la marca,
   en el siguiente mensaje usa la marca nueva.
2. Si hay **varias variantes** que coinciden (por ejemplo, distintas
   variedades o contenidos), agrega variedad o contenido para elegir una.
3. Si hay **varios lotes**, indica `lote N` para cambiar cantidad o
   vencimiento. Si hay un solo lote, se elige solo.
4. El SKU se actualiza automáticamente cuando cambias nombre, marca, rubro,
   variedad o contenido.

### Ejemplo de edición completa

```text
cambia la marca de aceite de girasol Cocinero a Kaly
```

Luego, usando la marca nueva:

```text
cambia el rubro de aceite de girasol Kaly a Alimentos
```

Luego:

```text
cambia la variedad de aceite de girasol Kaly a Extra Virgen
```

```text
cambia el contenido de aceite de girasol Kaly a 2 L
```

---

## 6. Lotes y cantidades

Cada alta crea un lote con un número fijo (`Lote #1`, `Lote #2`, …). El
inventario muestra el vencimiento más próximo y los números de lote debajo.

| Operación | Ejemplo |
|-----------|---------|
| Ver lotes | `Muéstrame los lotes de leche de la marca Bell` |
| Cambiar cantidad de un lote | `cambia la cantidad del lote 3 de leche Bell a 20` |
| Sumar unidades a un lote | `suma 8 unidades al lote 3 de leche Bell` |
| Cambiar vencimiento de un lote | `cambia el vencimiento del lote 3 de leche Bell al 31/12/2026` |
| Eliminar un lote completo | `elimina el lote 3 de leche Bell` |
| Descontar unidades de un lote | `elimina 2 unidades del lote 3 de leche Bell` |

> Los números de lote se conservan al editar. Editar **no** crea lotes:
> solo `agrega` crea un lote nuevo.

---

## 7. Eliminación

| Qué quieres eliminar | Ejemplo | Resultado |
|----------------------|---------|-----------|
| Una variante completa | `elimina leche Bell` | Borra la variante con todos sus lotes |
| Un lote puntual | `elimina el lote 3 de leche Bell` | Borra solo ese lote |
| Unidades de un lote | `elimina 2 unidades del lote 3 de leche Bell` | Descuenta 2 de ese lote |
| Unidades sin indicar lote | `elimina 2 unidades de leche Bell` | Descuenta de los lotes más antiguos por fecha de ingreso |

Si al borrar ya no quedan lotes, se elimina la variante. Si el producto queda
sin variantes, también se elimina el producto.

> ⚠️ `elimina leche Bell` borra **todo** ese producto/variante. Si solo quieres
> quitar un lote o unas unidades, indícalo explícitamente.

Desde el inventario también puedes usar el ícono de papelera roja. Ese borrado
elimina la variante completa y, si corresponde, el producto.

---

## 8. Qué hace el chat si falta información

| Situación | Respuesta del chat |
|-----------|--------------------|
| No indicas la fecha de vencimiento | Pide la fecha en formato `dd/mm/aaaa` |
| Hay varios lotes y pides cambiar cantidad o vencimiento | Muestra los lotes y pide `lote N` |
| Hay varias variantes que coinciden | Pide marca, variedad o contenido |
| No encuentra el producto o la marca | Avisa que no existe |
| El contenido no se entiende | Pide escribirlo como `1.5 L` o `500 g` |
| Tu rol es `user` e intentas escribir | Bloquea la acción y avisa |

---

## 9. Límites y recomendaciones

- **Un producto por mensaje.** No mezcles dos altas o dos ediciones distintas.
- **Incluye producto y marca siempre.** El chat no recuerda el mensaje anterior.
- **Usa “ingresó” y “vence”** para que las dos fechas se tomen sin ambigüedad.
- **Para sumar stock usa “suma”**, no “agrega” (que crea un lote nuevo).
- **Para borrar solo una parte, indica el lote o la cantidad.**
- Las **altas, ediciones y borrados usan IA**. Si la cuota gratuita diaria se
  agota, el chat lo avisa; las consultas simples siguen funcionando.
- Los cambios de esta guía requieren **volver a desplegar**:
  - Render: **Manual Deploy → Deploy latest commit**.
  - Vercel: **Redeploy**.

---

## 10. Chuleta rápida

```text
# Consultar
¿Cuánto queda de leche de la marca Bell?
Muéstrame los lotes de leche de la marca Bell
Muéstrame el inventario

# Alta completa
agrega 12 unidades de aceite de girasol marca Cocinero del rubro Aceites, variedad refinado, contenido 1.5 L, ingreso el 10/01/2026 y vence el 20/12/2026

# Nuevo lote de un producto existente
agrega 8 unidades de leche Bell entera de 1 L del rubro Lacteos, ingreso el 05/02/2026 y vence el 05/03/2026

# Editar datos
cambia la marca de leche Bell a Kaly
cambia el rubro de leche Kaly a Bebidas
cambia el nombre de leche Kaly a Leche Entera
cambia la variedad de leche Kaly a Descremada
cambia el contenido de leche Kaly a 1.5 L
cambia la cantidad del lote 3 de leche Kaly a 15
suma 5 unidades al lote 3 de leche Kaly
cambia el vencimiento del lote 3 de leche Kaly al 20/12/2026

# Eliminar
elimina el lote 3 de leche Kaly
elimina 2 unidades del lote 3 de leche Kaly
elimina leche Kaly
```
