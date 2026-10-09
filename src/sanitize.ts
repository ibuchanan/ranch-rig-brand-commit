export type Sanitized = { kind: "usable"; message: string } | { kind: "unusable" };

const FENCE_OPEN = /^\s*```[^\n]*\n/;
const FENCE_CLOSE = /\n\s*```\s*$/;

const QUOTE_OPEN = /^"/;
const QUOTE_CLOSE = /"$/;

/**
 * Known lead-ins, longest-shape first within each intent. Only these are forgiven:
 * sanitization strips wrapping, it does not judge what a subject should say. A
 * response that opens with phrasing outside this list is rejected rather than
 * half-cleaned, because a half-cleaned message is worse than no message.
 */
const LEAD_INS = [
  /^(?:sure|certainly|of course|absolutely|got it|no problem)\b[!,.]*\s*/i,
  /^(?:here(?:'s| is| are)|here i would suggest)\s+(?:the\s+)?(?:commit\s+)?message\s*[:–-]?\s*/i,
  /^(?:the\s+)?(?:suggested\s+|proposed\s+|appropriate\s+)?commit\s+message\s+(?:would\s+be|is)\s*[:–-]?\s*/i,
];

const ANY_FENCE = "```";

const MAX_LENGTH = 4096;

/**
 * The model's answer arrives wrapped far more often than not, so the wrapping is
 * stripped and the result validated rather than trusted. Sanitization is
 * shape-agnostic: it removes wrapping and rejects what it cannot account for, but
 * never judges whether the subject itself is well-formed — that is the commit
 * skill's judgement, not this tool's.
 *
 * Every transformation takes the response as one string and no rule depends on
 * where line boundaries fall. The prior-art shell expressions were line-anchored,
 * so they handled only a single-line backtick-wrapped answer and left the *common*
 * fenced block standing.
 */
export function sanitize(response: string): Sanitized {
  return validate(stripWrapping(response.trim()));
}

/**
 * Unwrapping exposes the next wrapping: quotes around a fenced block leave the
 * fence once the quotes are gone. So the pipeline repeats until it stops making
 * progress, which is what keeps a trailing fence from surviving unwrapping.
 */
function stripWrapping(text: string): string {
  const unwrapped = stripLeadIns(unwrapQuotes(unwrapFences(text)));

  return unwrapped === text ? text : stripWrapping(unwrapped);
}

/**
 * A fence that survives unwrapping, an empty result, and a response past the length
 * ceiling all mean the same thing to the caller: there is no message worth writing.
 * Half-writing one is worse than writing none, so the commit is abandoned.
 */
function validate(message: string): Sanitized {
  if (message === "" || message.includes(ANY_FENCE) || message.length > MAX_LENGTH) {
    return { kind: "unusable" };
  }

  return { kind: "usable", message };
}

function unwrapFences(text: string): string {
  return text.replace(FENCE_OPEN, "").replace(FENCE_CLOSE, "").trim();
}

function unwrapQuotes(text: string): string {
  return text.replace(QUOTE_OPEN, "").replace(QUOTE_CLOSE, "").trim();
}

function stripLeadIns(text: string): string {
  const stripped = LEAD_INS.reduce((current, leadIn) => current.replace(leadIn, ""), text);

  return stripped === text ? text.trim() : stripLeadIns(stripped);
}