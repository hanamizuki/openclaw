// Line helper module enforces the per-account outbound send policy.
//
// `channels.line.outboundPolicy: "human-approval-only"` turns the LINE channel into
// inbound-only from OpenClaw's point of view: every send that reaches the outbound
// adapter — auto replies, the `message` tool, restart recovery, approval forwarding,
// the CLI — fails before any LINE API call. A separate human-approval executor that
// pushes through the LINE Messaging API directly is the only way a customer receives
// a message. Inbound webhooks, profile lookups, and loading animations are unaffected.
import { PlatformMessageNotDispatchedError } from "openclaw/plugin-sdk/error-runtime";
import type { LineOutboundPolicy, ResolvedLineAccount } from "./types.js";

export const LINE_OUTBOUND_POLICY_DEFAULT: LineOutboundPolicy = "default";
export const LINE_OUTBOUND_POLICY_HUMAN_APPROVAL_ONLY: LineOutboundPolicy = "human-approval-only";

/**
 * Loose on purpose: runtime account resolvers (and test doubles) may hand back a
 * partial account, and a missing config must read as `default`, never throw.
 */
type LineOutboundPolicyAccount = {
  accountId?: ResolvedLineAccount["accountId"];
  config?: Partial<Pick<ResolvedLineAccount["config"], "outboundPolicy">> | null;
} | null;

/** Raised before any LINE API call when the account refuses direct sends. */
export class LineOutboundPolicyError extends Error {
  readonly accountId: string;
  readonly policy: LineOutboundPolicy;

  constructor(accountId: string, policy: LineOutboundPolicy) {
    super(
      `LINE outbound for account "${accountId}" is ${policy} (channels.line.outboundPolicy): ` +
        "OpenClaw never sends to LINE users directly under this policy. Post the reply as a " +
        "draft for human approval instead; only the approval executor pushes to LINE.",
    );
    this.name = "LineOutboundPolicyError";
    this.accountId = accountId;
    this.policy = policy;
  }
}

/** Resolves the effective outbound policy; unknown or missing values mean `default`. */
export function resolveLineOutboundPolicy(
  account: LineOutboundPolicyAccount | undefined,
): LineOutboundPolicy {
  return account?.config?.outboundPolicy === LINE_OUTBOUND_POLICY_HUMAN_APPROVAL_ONLY
    ? LINE_OUTBOUND_POLICY_HUMAN_APPROVAL_ONLY
    : LINE_OUTBOUND_POLICY_DEFAULT;
}

/**
 * Throws a non-retryable dispatch error when the account is human-approval-only.
 * Non-retryable keeps durable queues and recovery from replaying a send the policy
 * will refuse forever.
 */
export function assertLineOutboundAllowed(account: LineOutboundPolicyAccount | undefined): void {
  if (resolveLineOutboundPolicy(account) !== LINE_OUTBOUND_POLICY_HUMAN_APPROVAL_ONLY) {
    return;
  }
  const cause = new LineOutboundPolicyError(
    account?.accountId ?? "default",
    LINE_OUTBOUND_POLICY_HUMAN_APPROVAL_ONLY,
  );
  throw new PlatformMessageNotDispatchedError(cause.message, { cause, retryable: false });
}
