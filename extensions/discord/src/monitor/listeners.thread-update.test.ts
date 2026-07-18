import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ close: vi.fn(async () => 1) }));
vi.mock("./thread-session-close.js", () => ({ closeDiscordThreadSessions: mocks.close }));

async function setup() {
  const { DiscordThreadUpdateListener } = await import("./listeners.js");
  const cfg = {};
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const client = { rest: { put: vi.fn(async () => undefined) } };
  const listener = new DiscordThreadUpdateListener(cfg, logger as never);
  return { cfg, logger, client, listener };
}

describe("DiscordThreadUpdateListener rejoin", () => {
  beforeEach(() => vi.clearAllMocks());
  it("closes archived sessions without rejoining", async () => {
    const { cfg, client, listener } = await setup();
    await listener.handle({ id: "thread-42", thread_metadata: { archived: true } } as never, client as never);
    expect(mocks.close).toHaveBeenCalledWith({ cfg, threadId: "thread-42" });
    expect(client.rest.put).not.toHaveBeenCalled();
  });
  it("rejoins unarchived threads without closing sessions", async () => {
    const { client, listener } = await setup();
    await listener.handle({ id: "thread-42", thread_metadata: { archived: false } } as never, client as never);
    expect(client.rest.put).toHaveBeenCalledWith("/channels/thread-42/thread-members/@me");
    expect(mocks.close).not.toHaveBeenCalled();
  });
  it("reports rejoin failure without rejecting the listener", async () => {
    const { client, listener, logger } = await setup();
    client.rest.put.mockRejectedValueOnce(new Error("permission denied"));
    await expect(listener.handle({ id: "thread-42", thread_metadata: { archived: false } } as never, client as never)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("discord thread rejoin failed"), { threadId: "thread-42" });
    expect(logger.info).not.toHaveBeenCalled();
  });
  it("ignores events without a thread id", async () => {
    const { client, listener } = await setup();
    await listener.handle({ thread_metadata: { archived: false } } as never, client as never);
    expect(client.rest.put).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
  });
});
