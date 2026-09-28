// Transient user-turn transcript context carried through runtime queues.
import type { AgentMessage } from "../../packages/agent-core/src/types.js";
import type {
  PersistedUserTurnMessage,
  UserTurnTranscriptRecorder,
} from "./user-turn-transcript.types.js";

const RUNTIME_USER_TURN_TRANSCRIPT_CONTEXT = Symbol.for(
  "openclaw.runtimeUserTurnTranscriptContext",
);
const RUNTIME_USER_TURN_TRANSCRIPT_RECORDER = Symbol.for(
  "openclaw.runtimeUserTurnTranscriptRecorder",
);
const RUNTIME_USER_TURN_TRANSCRIPT_CONTENT = Symbol.for(
  "openclaw.runtimeUserTurnTranscriptContent",
);

type RuntimeUserTurnTranscriptContext = {
  message: PersistedUserTurnMessage;
  recorder: UserTurnTranscriptRecorder;
};

/** Carries transcript-only fields with a queued runtime message without exposing them to the model. */
export function attachRuntimeUserTurnTranscriptContext(
  runtimeMessage: PersistedUserTurnMessage,
  context: RuntimeUserTurnTranscriptContext,
): PersistedUserTurnMessage {
  Object.defineProperty(runtimeMessage, RUNTIME_USER_TURN_TRANSCRIPT_CONTEXT, {
    configurable: true,
    value: context,
  });
  return runtimeMessage;
}

/** Consumes the transient queued-turn context before the message is serialized. */
export function takeRuntimeUserTurnTranscriptContext(
  runtimeMessage: AgentMessage,
): RuntimeUserTurnTranscriptContext | undefined {
  const context = Reflect.get(runtimeMessage, RUNTIME_USER_TURN_TRANSCRIPT_CONTEXT) as
    | RuntimeUserTurnTranscriptContext
    | undefined;
  if (context) {
    Reflect.deleteProperty(runtimeMessage, RUNTIME_USER_TURN_TRANSCRIPT_CONTEXT);
  }
  return context;
}

/** Records the transcript form of runtime content that carries model-only additions. */
export function attachRuntimeUserTurnTranscriptContent(
  runtimeMessage: PersistedUserTurnMessage,
  content: PersistedUserTurnMessage["content"],
): PersistedUserTurnMessage {
  Object.defineProperty(runtimeMessage, RUNTIME_USER_TURN_TRANSCRIPT_CONTENT, {
    configurable: true,
    value: content,
  });
  return runtimeMessage;
}

/**
 * Reads the transcript form without consuming it: every persistence of this
 * runtime message must drop the model-only additions, not only the first.
 */
export function readRuntimeUserTurnTranscriptContent(
  runtimeMessage: AgentMessage,
): PersistedUserTurnMessage["content"] | undefined {
  return Reflect.get(runtimeMessage, RUNTIME_USER_TURN_TRANSCRIPT_CONTENT) as
    | PersistedUserTurnMessage["content"]
    | undefined;
}

/** Keeps the queued recorder attached to the exact final message until persistence succeeds. */
export function attachRuntimeUserTurnTranscriptRecorder(
  runtimeMessage: AgentMessage,
  recorder: UserTurnTranscriptRecorder,
): AgentMessage {
  Object.defineProperty(runtimeMessage, RUNTIME_USER_TURN_TRANSCRIPT_RECORDER, {
    configurable: true,
    value: recorder,
  });
  return runtimeMessage;
}

function readRuntimeUserTurnTranscriptRecorder(
  runtimeMessage: AgentMessage,
): UserTurnTranscriptRecorder | undefined {
  return Reflect.get(runtimeMessage, RUNTIME_USER_TURN_TRANSCRIPT_RECORDER) as
    | UserTurnTranscriptRecorder
    | undefined;
}

/** A steered message retains its own live custody while another turn owns the runtime. */
export function withRuntimeUserTurnTranscriptRecorder<T>(
  runtimeMessage: AgentMessage,
  append: () => T,
): T {
  const recorder = readRuntimeUserTurnTranscriptRecorder(runtimeMessage);
  return recorder?.withPendingInput ? recorder.withPendingInput(append) : append();
}

export function takeRuntimeUserTurnTranscriptRecorder(
  runtimeMessage: AgentMessage,
): UserTurnTranscriptRecorder | undefined {
  const recorder = readRuntimeUserTurnTranscriptRecorder(runtimeMessage);
  if (recorder) {
    Reflect.deleteProperty(runtimeMessage, RUNTIME_USER_TURN_TRANSCRIPT_RECORDER);
  }
  return recorder;
}
