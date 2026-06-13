import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import { config } from "./config";
import { apiRouter } from "./rest/routes";
import { attachGameSocket } from "./ws/gameSocket";
import { startSessionSweeper } from "./game/sessionStore";
import "./db/db"; // initialize the SQLite schema on boot

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "finger-sprint-backend" });
});
app.use("/api", apiRouter);

const server = createServer(app);
attachGameSocket(server);
startSessionSweeper();

server.listen(config.port, () => {
  console.log(
    `[finger-sprint] backend listening on http://localhost:${config.port}  (REST: /api, WebSocket: /ws)`,
  );
});
