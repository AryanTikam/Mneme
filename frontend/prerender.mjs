import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "dist");
const serverEntryPath = path.resolve(__dirname, ".output/server/index.mjs");

async function prerender() {
  console.log("Starting static prerender for TanStack Start SPA...");
  const serverModule = await import(serverEntryPath);
  const handler = serverModule.default || serverModule;

  const env = { ASSETS: { fetch: async () => new Response("not found", { status: 404 }) } };
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

  const routes = [
    { path: "/", file: "index.html" },
    { path: "/flashcards", file: "flashcards.html", dir: "flashcards/index.html" },
    { path: "/quiz", file: "quiz.html", dir: "quiz/index.html" },
    { path: "/blurt", file: "blurt.html", dir: "blurt/index.html" },
  ];

  for (const route of routes) {
    const req = new Request("http://localhost:5000" + route.path);
    const res = await handler.fetch(req, env, ctx);
    const html = await res.text();

    const targetFile = path.join(distDir, route.file);
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.writeFile(targetFile, html, "utf-8");
    console.log(`Rendered ${route.path} -> ${route.file} (${html.length} bytes)`);

    if (route.dir) {
      const targetDirFile = path.join(distDir, route.dir);
      await fs.mkdir(path.dirname(targetDirFile), { recursive: true });
      await fs.writeFile(targetDirFile, html, "utf-8");
      console.log(`Rendered ${route.path} -> ${route.dir}`);
    }
  }

  console.log("Prerender complete!");
}

prerender().catch(err => {
  console.error("Prerender failed:", err);
  process.exit(1);
});

