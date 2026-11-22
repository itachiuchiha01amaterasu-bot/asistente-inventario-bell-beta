import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // En Docker se genera un servidor autónomo (server.js) que no necesita
  // node_modules en la imagen final. En Vercel se mantiene el comportamiento
  // normal, por eso solo se activa durante el build de Docker.
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
};

export default nextConfig;
