import express from "express";
import { galleryRouter } from "./galleryRoutes";

// Standalone dev/mock API server only. Nebula core owns the production Gallery backend.

const app = express();
const port = Number(process.env.PORT ?? 4174);

app.use(express.json());
app.use("/api/gallery", galleryRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof Error && error.name === "UnauthenticatedError") {
    res.status(401).json({ error: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Unexpected server error" });
});

app.listen(port, () => {
  console.log(`Nebula Gallery mock API server listening on http://127.0.0.1:${port}`);
});