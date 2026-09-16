// Line tests cover the outbound send policy (human-approval-only kill switch).
import { PlatformMessageNotDispatchedError } from "openclaw/plugin-sdk/error-runtime";
import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../api.js";
import { createRuntime } from "./channel.sendPayload.test-support.js";
import {
  LINE_OUTBOUND_POLICY_DEFAULT,
  LINE_OUTBOUND_POLICY_HUMAN_APPROVAL_ONLY,
  LineOutboundPolicyError,
  assertLineOutboundAllowed,
  resolveLineOutboundPolicy,
} from "./outbound-policy.js";
import { lineMessageAdapter, lineOutboundAdapter } from "./outbound.js";
import { setLineRuntime } from "./runtime.js";

const APPROVAL_ONLY_CFG = {
  channels: { line: { outboundPolicy: "human-approval-only" } },
} as OpenClawConfig;

function sendMockNames(mocks: ReturnType<typeof createRuntime>["mocks"]) {
  return [
    "pushMessageLine",
    "pushMessagesLine",
    "pushFlexMessage",
    "pushTemplateMessage",
    "pushLocationMessage",
    "pushTextMessageWithQuickReplies",
    "sendMessageLine",
  ] as const satisfies ReadonlyArray<keyof typeof mocks>;
}

function expectNoLineSend(mocks: ReturnType<typeof createRuntime>["mocks"]) {
  for (const name of sendMockNames(mocks)) {
    expect(mocks[name], name).not.toHaveBeenCalled();
  }
}

async function expectPolicyRefusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => {
      throw new Error("expected the send to be refused");
    },
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(PlatformMessageNotDispatchedError);
  const dispatchError = error as PlatformMessageNotDispatchedError;
  expect(dispatchError.retryable).toBe(false);
  expect(dispatchError.message).toContain("human-approval-only");
  expect(dispatchError.cause).toBeInstanceOf(LineOutboundPolicyError);
}

afterEach(() => {
  setLineRuntime(undefined as unknown as Parameters<typeof setLineRuntime>[0]);
});

describe("resolveLineOutboundPolicy", () => {
  it("defaults when the key is missing or unknown", () => {
    expect(resolveLineOutboundPolicy({ config: {} })).toBe(LINE_OUTBOUND_POLICY_DEFAULT);
    expect(resolveLineOutboundPolicy(undefined)).toBe(LINE_OUTBOUND_POLICY_DEFAULT);
    expect(resolveLineOutboundPolicy({ accountId: "x" })).toBe(LINE_OUTBOUND_POLICY_DEFAULT);
    expect(() => assertLineOutboundAllowed({ config: null })).not.toThrow();
    expect(resolveLineOutboundPolicy({ config: { outboundPolicy: "default" } })).toBe(
      LINE_OUTBOUND_POLICY_DEFAULT,
    );
    expect(
      resolveLineOutboundPolicy({
        config: { outboundPolicy: "nonsense" as unknown as "default" },
      }),
    ).toBe(LINE_OUTBOUND_POLICY_DEFAULT);
  });

  it("recognises human-approval-only", () => {
    expect(resolveLineOutboundPolicy({ config: { outboundPolicy: "human-approval-only" } })).toBe(
      LINE_OUTBOUND_POLICY_HUMAN_APPROVAL_ONLY,
    );
  });

  it("assertLineOutboundAllowed only throws under human-approval-only", () => {
    expect(() => assertLineOutboundAllowed({ accountId: "default", config: {} })).not.toThrow();
    expect(() =>
      assertLineOutboundAllowed({
        accountId: "default",
        config: { outboundPolicy: "human-approval-only" },
      }),
    ).toThrow(PlatformMessageNotDispatchedError);
  });
});

describe("line outbound human-approval-only policy", () => {
  it("refuses sendPayload before any LINE API call", async () => {
    const { runtime, mocks } = createRuntime();
    setLineRuntime(runtime);

    await expectPolicyRefusal(
      lineOutboundAdapter.sendPayload!({
        to: "line:user:U1",
        text: "hello",
        payload: { text: "hello" },
        accountId: "default",
        cfg: APPROVAL_ONLY_CFG,
      }),
    );
    expectNoLineSend(mocks);
  });

  it("refuses media, quick-reply and message-adapter entry points too", async () => {
    const { runtime, mocks } = createRuntime();
    setLineRuntime(runtime);

    await expectPolicyRefusal(
      lineOutboundAdapter.sendMedia!({
        to: "line:user:U1",
        text: "caption",
        mediaUrl: "https://example.com/a.jpg",
        accountId: "default",
        cfg: APPROVAL_ONLY_CFG,
      }),
    );
    await expectPolicyRefusal(
      lineOutboundAdapter.sendPayload!({
        to: "line:user:U1",
        text: "pick",
        payload: { text: "pick", channelData: { line: { quickReplies: ["A", "B"] } } },
        accountId: "default",
        cfg: APPROVAL_ONLY_CFG,
      }),
    );
    await expectPolicyRefusal(
      lineMessageAdapter.send.text({
        cfg: APPROVAL_ONLY_CFG,
        to: "line:user:U1",
        text: "hello",
        accountId: "default",
      }),
    );
    expectNoLineSend(mocks);
  });

  it("applies per-account overrides and leaves other accounts sending", async () => {
    const { runtime, mocks } = createRuntime();
    setLineRuntime(runtime);
    mocks.resolveTextChunkLimit.mockReturnValue(5000);
    const cfg = {
      channels: {
        line: {
          accounts: { support: { outboundPolicy: "human-approval-only" } },
        },
      },
    } as OpenClawConfig;

    await expectPolicyRefusal(
      lineOutboundAdapter.sendPayload!({
        to: "line:user:U1",
        text: "hello",
        payload: { text: "hello" },
        accountId: "support",
        cfg,
      }),
    );
    expectNoLineSend(mocks);

    await lineOutboundAdapter.sendPayload!({
      to: "line:user:U1",
      text: "hello",
      payload: { text: "hello" },
      accountId: "default",
      cfg,
    });
    expect(mocks.pushMessageLine).toHaveBeenCalledTimes(1);
  });

  it("keeps the default policy sending", async () => {
    const { runtime, mocks } = createRuntime();
    setLineRuntime(runtime);
    mocks.resolveTextChunkLimit.mockReturnValue(5000);

    await lineOutboundAdapter.sendPayload!({
      to: "line:user:U1",
      text: "hello",
      payload: { text: "hello" },
      accountId: "default",
      cfg: { channels: { line: { outboundPolicy: "default" } } } as OpenClawConfig,
    });
    expect(mocks.pushMessageLine).toHaveBeenCalledTimes(1);
  });
});
