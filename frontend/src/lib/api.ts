// URL única del backend. En producción se define NEXT_PUBLIC_API_URL en Vercel.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
