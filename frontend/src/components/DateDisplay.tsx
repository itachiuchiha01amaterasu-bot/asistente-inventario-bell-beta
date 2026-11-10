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

  return (
    <span className="hidden whitespace-nowrap text-xs font-semibold tracking-wide text-orange-500 min-[360px]:inline sm:text-sm lg:text-lg">
      {fecha}
    </span>
  );
}
