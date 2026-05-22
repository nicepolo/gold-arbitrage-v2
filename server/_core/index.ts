import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("[Database] DATABASE_URL not set, skipping migrations");
    return;
  }
  try {
    const mysql = await import("mysql2/promise");
    const conn = await mysql.createConnection(dbUrl);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`calc_history\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`buy_price_usd_oz\` decimal(10,4) NOT NULL,
        \`sell_price_vnd_wan\` decimal(10,2) NOT NULL,
        \`rate_vnd_usd\` decimal(12,2) NOT NULL,
        \`weight_g\` decimal(8,2) NOT NULL,
        \`expense_usd\` decimal(10,2) NOT NULL,
        \`total_cost_usd\` decimal(12,4) NOT NULL,
        \`total_revenue_usd\` decimal(12,4) NOT NULL,
        \`net_profit_usd\` decimal(12,4) NOT NULL,
        \`roi\` decimal(8,4) NOT NULL,
        \`session_id\` varchar(64),
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`calc_history_id\` PRIMARY KEY(\`id\`)
      )
    `);
    await conn.end();
    console.log("[Database] calc_history table ensured");
  } catch (error) {
    console.error("[Database] Migration error (non-fatal):", error);
  }
}

async function startServer() {
  await runMigrations();
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Health check endpoint for Railway
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
