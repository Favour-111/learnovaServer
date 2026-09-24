import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../app";

// No real Mongo connection in this test  /health has no DB dependency at
// all (that's the point of it), and /health/db is exercised against
// mongoose's default disconnected state, which is exactly what a genuine
// outage looks like from this endpoint's point of view.
describe("health endpoints", () => {
  const app = createApp();

  it("GET /health reports ok without touching the database", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });

  it("GET /health/db reports unhealthy when Mongo is not connected", async () => {
    expect(mongoose.connection.readyState).not.toBe(1); // never connected in this test file
    const res = await request(app).get("/health/db");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "unhealthy", database: "disconnected" });
  });

  it("GET /health/db reports healthy once connected, using only a mocked ping (no real DB needed)", async () => {
    // Simulates the "actually connected" branch without requiring a real
    // MongoDB instance in this environment  readyState flipped directly,
    // and connection.db.admin().ping() stubbed to resolve like a real one
    // would.
    const originalReadyState = mongoose.connection.readyState;
    const originalDb = mongoose.connection.db;
    const pingMock = jest.fn().mockResolvedValue({ ok: 1 });
    Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
    Object.defineProperty(mongoose.connection, "db", { value: { admin: () => ({ ping: pingMock }) }, configurable: true });

    try {
      const res = await request(app).get("/health/db");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "healthy", database: "connected" });
      expect(pingMock).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(mongoose.connection, "readyState", { value: originalReadyState, configurable: true });
      Object.defineProperty(mongoose.connection, "db", { value: originalDb, configurable: true });
    }
  });
});
