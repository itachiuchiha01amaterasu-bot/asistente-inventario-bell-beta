"use client";

import { XMarkIcon } from "@heroicons/react/24/solid";

type Props = {
  variante: any;
  form: any;
  setForm: (v: any) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function EditarVariante({
  variante,
  form,
  setForm,
  onClose,
  onSave,
}: Props) {
  if (!variante) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-xl sm:rounded-xl sm:p-6">

        {/* Botón cerrar */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-200 transition"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>

        <h2 className="mb-4 pr-8 text-lg font-semibold text-orange-400 sm:text-xl">
          Editar {form.product_name}
        </h2>

        <div className="space-y-4">
          {[
            ["product_name", "Producto"],
            ["category", "Rubro"],
            ["brand", "Marca"],
            ["type_variety", "Variedad"],
            ["content_value", "Contenido (valor)"],
            ["content_unit", "Unidad"],
          ].map(([campo, label]) => (
            <div key={campo}>
              <label className="text-gray-300 text-sm">{label}</label>
              <input
                type="text"
                value={form[campo] ?? ""}
                onChange={(e) =>
                  setForm({ ...form, [campo]: e.target.value })
                }
                className="w-full rounded border border-[#333] bg-[#111] p-2.5 text-base text-white focus:ring-2 focus:ring-orange-500"
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            onClick={onClose}
            className="w-full rounded bg-gray-600 px-4 py-2 text-white transition hover:bg-gray-700 sm:w-auto"
          >
            Cancelar
          </button>

          <button
            onClick={() => {
              // Separar valor y unidad si el usuario escribió todo junto (ej: "200gr")
              const rawValue = form.content_value?.toString().trim() || "";
              const match = rawValue.match(/^([\d\.]+)\s*([a-zA-Z]*)$/);
              const parsedValue = match ? match[1] : rawValue;
              const parsedUnit = match ? (match[2] || form.content_unit) : form.content_unit;

              const formToSave = {
                ...form,
                content_value: parsedValue,
                content_unit: parsedUnit,
              };

              // Actualizar el formulario con los valores parseados
              setForm(formToSave);
              onSave();
            }}
            className="w-full rounded bg-green-600 px-4 py-2 text-white transition hover:bg-green-700 sm:w-auto"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
