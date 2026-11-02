"use client";

import { useEffect, useState } from "react";

export default function DateDisplay() {
  const [fecha, setFecha] = useState(() => {
    return new Date().toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setFecha(
        new Date().toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      );
    }, 60_000); // se actualiza cada minuto

    return () => clearInterval(timer);
  }, []);

  return <span className="text-lg font-semibold text-orange-500 tracking-wide">{fecha}</span>;
}
