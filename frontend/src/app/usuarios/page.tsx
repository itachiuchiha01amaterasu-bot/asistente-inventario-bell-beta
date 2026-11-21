"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

import { useAuth } from "@/context/AuthContext";
import { API_URL } from "@/lib/api";

type Usuario = {
  id: number;
  username: string;
  email: string;
  role: string;
  created_at: string | null;
};

type Formulario = {
  username: string;
  email: string;
  role: string;
  password: string;
};

const FORMULARIO_VACIO: Formulario = {
  username: "",
  email: "",
  role: "user",
  password: "",
};

const ROLES = [
  { id: "user", texto: "Consulta" },
  { id: "admin", texto: "Administrador" },
  { id: "super_admin", texto: "Super administrador" },
];

const textoRol = (rol: string) =>
  ROLES.find((r) => r.id === rol)?.texto ?? rol;

const claseRol = (rol: string) => {
  switch (rol) {
    case "super_admin":
      return "border-orange-500/40 bg-orange-500/15 text-orange-300";
    case "admin":
      return "border-cyan-500/40 bg-cyan-500/15 text-cyan-300";
    default:
      return "border-[#3a3a3a] bg-[#111] text-gray-300";
  }
};

const formatearFecha = (fecha: string | null) => {
  if (!fecha) return "Sin fecha";

  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!soloFecha) return "Sin fecha";

  return `${soloFecha[3]}/${soloFecha[2]}/${soloFecha[1]}`;
};

export default function Usuarios() {
  const { user, token, isAuthenticated, isReady, login } = useAuth();
  const router = useRouter();

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Modal de alta / edición
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VACIO);
  const [verPassword, setVerPassword] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);

  // Modal de eliminación
  const [porEliminar, setPorEliminar] = useState<Usuario | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const esSuperAdmin = user?.role === "super_admin";

  useEffect(() => {
    if (!isReady) return;

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    if (!esSuperAdmin) {
      router.replace("/");
    }
  }, [isReady, isAuthenticated, esSuperAdmin, router]);

  const cargarUsuarios = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const datos = await res.json().catch(() => ({}));
        throw new Error(datos.error || "No se pudo cargar la lista de usuarios");
      }

      const datos = await res.json();
      setUsuarios(datos.usuarios || []);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cargar la lista de usuarios"
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!esSuperAdmin || !token) return;

    let cancelado = false;

    fetch(`${API_URL}/api/auth/users`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("No se pudo cargar la lista de usuarios");
        return res.json();
      })
      .then((datos) => {
        if (cancelado) return;
        setUsuarios(datos.usuarios || []);
        setError(null);
      })
      .catch((e) => {
        if (cancelado) return;
        setError(
          e instanceof Error
            ? e.message
            : "No se pudo cargar la lista de usuarios"
        );
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [esSuperAdmin, token]);

  // Cerrar modales con Escape.
  useEffect(() => {
    if (!modalAbierto && !porEliminar) return;

    const alPresionar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (guardando || eliminando) return;

      setModalAbierto(false);
      setPorEliminar(null);
    };

    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [modalAbierto, porEliminar, guardando, eliminando]);

  const usuariosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    if (!texto) return usuarios;

    return usuarios.filter((u) =>
      `${u.username} ${u.email} ${textoRol(u.role)}`
        .toLowerCase()
        .includes(texto)
    );
  }, [usuarios, busqueda]);

  const esMiCuenta = (usuario: Usuario) =>
    String(usuario.id) === String(user?.id);

  const abrirAlta = () => {
    setEditando(null);
    setFormulario(FORMULARIO_VACIO);
    setVerPassword(false);
    setErrorFormulario(null);
    setModalAbierto(true);
  };

  const abrirEdicion = (usuario: Usuario) => {
    setEditando(usuario);
    setFormulario({
      username: usuario.username,
      email: usuario.email,
      role: usuario.role,
      password: "",
    });
    setVerPassword(false);
    setErrorFormulario(null);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    if (guardando) return;

    setModalAbierto(false);
    setErrorFormulario(null);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const username = formulario.username.trim();
    const email = formulario.email.trim();

    if (!username || !email) {
      setErrorFormulario("Usuario y correo son obligatorios.");
      return;
    }

    if (!editando && formulario.password.length < 8) {
      setErrorFormulario(
        "La contraseña debe tener al menos 8 caracteres."
      );
      return;
    }

    if (editando && formulario.password && formulario.password.length < 8) {
      setErrorFormulario(
        "La contraseña nueva debe tener al menos 8 caracteres."
      );
      return;
    }

    setGuardando(true);
    setErrorFormulario(null);

    try {
      const cuerpo: Record<string, string> = {
        username,
        email,
        role: formulario.role,
      };

      if (formulario.password) cuerpo.password = formulario.password;

      const res = await fetch(
        editando
          ? `${API_URL}/api/auth/users/${editando.id}`
          : `${API_URL}/api/auth/users`,
        {
          method: editando ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(cuerpo),
        }
      );

      const datos = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(datos.error || "No se pudo guardar el usuario");
      }

      // Si edité mi propia cuenta, actualizo la sesión guardada.
      if (editando && esMiCuenta(editando) && datos.usuario) {
        login(token, {
          id: String(datos.usuario.id),
          username: datos.usuario.username,
          email: datos.usuario.email,
          role: datos.usuario.role,
        });
      }

      setAviso(
        editando
          ? "Usuario actualizado correctamente."
          : "Usuario creado correctamente."
      );
      setModalAbierto(false);
      await cargarUsuarios();

      window.setTimeout(() => setAviso(null), 4000);
    } catch (e) {
      setErrorFormulario(
        e instanceof Error ? e.message : "No se pudo guardar el usuario"
      );
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!token || !porEliminar) return;

    setEliminando(true);
    setErrorEliminar(null);

    try {
      const res = await fetch(
        `${API_URL}/api/auth/users/${porEliminar.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const datos = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(datos.error || "No se pudo eliminar el usuario");
      }

      setAviso(`Usuario "${porEliminar.username}" eliminado.`);
      setPorEliminar(null);
      await cargarUsuarios();

      window.setTimeout(() => setAviso(null), 4000);
    } catch (e) {
      setErrorEliminar(
        e instanceof Error ? e.message : "No se pudo eliminar el usuario"
      );
    } finally {
      setEliminando(false);
    }
  };

  if (!isReady || !isAuthenticated || !esSuperAdmin) return null;

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-orange-400 sm:text-3xl lg:text-4xl">
            Usuarios
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-400 sm:text-base">
            Crea cuentas, cambia roles o elimina usuarios. Solo el super
            administrador puede entrar a esta pantalla.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              cargarUsuarios();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[#3a3a3a] bg-[#111] px-4 py-2 text-sm font-semibold text-gray-300 transition hover:border-orange-500/60 hover:text-orange-300"
          >
            <ArrowPathIcon className="h-5 w-5" />
            Actualizar
          </button>

          <button
            type="button"
            onClick={abrirAlta}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
          >
            <PlusIcon className="h-5 w-5" />
            Nuevo usuario
          </button>
        </div>
      </div>

      {aviso && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-200"
        >
          <span className="min-w-0 break-words">{aviso}</span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            aria-label="Cerrar aviso"
            className="shrink-0 rounded px-2 py-0.5 transition hover:bg-green-500/20"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <UsersIcon className="h-5 w-5 text-orange-400" />
          {usuarios.length} usuario(s) registrado(s)
        </div>

        <label className="w-full sm:max-w-xs">
          <span className="sr-only">Buscar usuario</span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por usuario, correo o rol"
            className="w-full rounded-lg border border-[#3a3a3a] bg-[#111] px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-orange-500 focus:outline-none"
          />
        </label>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl bg-[#1b1b1b]"
            />
          ))}
        </div>
      ) : usuariosFiltrados.length === 0 ? (
        <p className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-6 text-center text-gray-500">
          No hay usuarios que coincidan con la búsqueda.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {usuariosFiltrados.map((usuario) => {
            const propia = esMiCuenta(usuario);

            return (
              <li
                key={usuario.id}
                className="flex flex-col rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-gray-100">
                      {usuario.username}
                      {propia && (
                        <span className="ml-2 align-middle text-xs font-normal text-orange-300">
                          (tú)
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 break-all text-sm text-gray-400">
                      {usuario.email}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${claseRol(usuario.role)}`}
                  >
                    {textoRol(usuario.role)}
                  </span>
                </div>

                <p className="mt-3 text-xs text-gray-500">
                  Creado el {formatearFecha(usuario.created_at)}
                </p>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-[#2a2a2a] pt-4">
                  <button
                    type="button"
                    onClick={() => abrirEdicion(usuario)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#3a3a3a] bg-[#111] px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-orange-500/60 hover:text-orange-300 sm:text-sm"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                    Editar
                  </button>

                  <button
                    type="button"
                    disabled={propia}
                    onClick={() => {
                      setPorEliminar(usuario);
                      setErrorEliminar(null);
                    }}
                    title={
                      propia
                        ? "No puedes eliminar tu propia cuenta"
                        : `Eliminar a ${usuario.username}`
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 sm:text-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Eliminar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* MODAL ALTA / EDICIÓN */}
      {modalAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-modal-usuario"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cerrarModal();
          }}
        >
          <form
            onSubmit={guardar}
            className="w-full max-w-lg rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-5 shadow-2xl sm:p-6"
          >
            <h2
              id="titulo-modal-usuario"
              className="text-xl font-semibold text-orange-300"
            >
              {editando ? "Editar usuario" : "Nuevo usuario"}
            </h2>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-300">
                  Usuario
                </span>
                <input
                  type="text"
                  value={formulario.username}
                  onChange={(e) =>
                    setFormulario((f) => ({ ...f, username: e.target.value }))
                  }
                  autoComplete="off"
                  className="w-full rounded-lg border border-[#3a3a3a] bg-[#111] px-3 py-2 text-sm text-gray-100 focus:border-orange-500 focus:outline-none"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-300">
                  Correo
                </span>
                <input
                  type="email"
                  value={formulario.email}
                  onChange={(e) =>
                    setFormulario((f) => ({ ...f, email: e.target.value }))
                  }
                  autoComplete="off"
                  className="w-full rounded-lg border border-[#3a3a3a] bg-[#111] px-3 py-2 text-sm text-gray-100 focus:border-orange-500 focus:outline-none"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-300">
                  Rol
                </span>
                <select
                  value={formulario.role}
                  onChange={(e) =>
                    setFormulario((f) => ({ ...f, role: e.target.value }))
                  }
                  disabled={!!editando && esMiCuenta(editando)}
                  className="w-full rounded-lg border border-[#3a3a3a] bg-[#111] px-3 py-2 text-sm text-gray-100 focus:border-orange-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {ROLES.map((rol) => (
                    <option key={rol.id} value={rol.id}>
                      {rol.texto}
                    </option>
                  ))}
                </select>
                {editando && esMiCuenta(editando) && (
                  <span className="mt-1 block text-xs text-gray-500">
                    No puedes cambiar tu propio rol.
                  </span>
                )}
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-300">
                  {editando
                    ? "Nueva contraseña (opcional)"
                    : "Contraseña"}
                </span>
                <div className="relative">
                  <input
                    type={verPassword ? "text" : "password"}
                    value={formulario.password}
                    onChange={(e) =>
                      setFormulario((f) => ({
                        ...f,
                        password: e.target.value,
                      }))
                    }
                    autoComplete="new-password"
                    placeholder={
                      editando
                        ? "Déjala vacía para no cambiarla"
                        : "Mínimo 8 caracteres"
                    }
                    className="w-full rounded-lg border border-[#3a3a3a] bg-[#111] px-3 py-2 pr-11 text-sm text-gray-100 placeholder:text-gray-500 focus:border-orange-500 focus:outline-none"
                    required={!editando}
                  />
                  <button
                    type="button"
                    onClick={() => setVerPassword((v) => !v)}
                    aria-label={
                      verPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 transition hover:text-orange-300"
                  >
                    {verPassword ? (
                      <EyeSlashIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </label>
            </div>

            {errorFormulario && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
              >
                {errorFormulario}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={cerrarModal}
                disabled={guardando}
                className="rounded-lg border border-[#3a3a3a] bg-[#111] px-4 py-2 text-sm font-semibold text-gray-300 transition hover:bg-[#222] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {guardando
                  ? "Guardando..."
                  : editando
                    ? "Guardar cambios"
                    : "Crear usuario"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL ELIMINAR */}
      {porEliminar && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-eliminar-usuario"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !eliminando) {
              setPorEliminar(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-[#1b1b1b] p-5 shadow-2xl sm:p-6">
            <h2
              id="titulo-eliminar-usuario"
              className="text-xl font-semibold text-red-300"
            >
              Eliminar usuario
            </h2>

            <p className="mt-3 text-sm text-gray-300">
              Vas a eliminar la cuenta{" "}
              <strong className="text-gray-100">
                {porEliminar.username}
              </strong>{" "}
              ({porEliminar.email}). Esta acción no se puede deshacer.
            </p>

            {errorEliminar && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
              >
                {errorEliminar}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPorEliminar(null)}
                disabled={eliminando}
                className="rounded-lg border border-[#3a3a3a] bg-[#111] px-4 py-2 text-sm font-semibold text-gray-300 transition hover:bg-[#222] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={eliminar}
                disabled={eliminando}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {eliminando ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
