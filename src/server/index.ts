import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { galleryRouter } from "./galleryRoutes";

const app = express();
const port = Number(process.env.PORT ?? 4174);
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "dist");

app.use(express.json());
app.use("/api/gallery", galleryRouter);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof Error && error.name === "UnauthenticatedError") {
    res.status(401).json({ error: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Unexpected server error" });
});

app.listen(port, () => {
  console.log(`Nebula core server listening on http://127.0.0.1:${port}`);
});