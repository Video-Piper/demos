// Verifies a Video Piper webhook, which follows the Standard Webhooks spec
// (https://www.standardwebhooks.com). No library needed.
import { createHmac, timingSafeEqual } from "node:crypto";

// Standard Webhooks recommends rejecting deliveries whose timestamp is more than 5 minutes
// off, so a captured request can't be replayed later.
const TOLERANCE_SECONDS = 300;

/**
 * @param {string} secret  signing secret from Account > Webhooks ("whsec_" + base64)
 * @param {Buffer} rawBody the request body exactly as received, before any JSON parsing
 * @param {Record<string, string | string[] | undefined>} headers lower-case request headers
 * @returns {unknown} the parsed event; throws if the delivery is not authentic
 */
export function verifyWebhook(secret, rawBody, headers) {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatures = headers["webhook-signature"];
  if (typeof id !== "string" || typeof timestamp !== "string" || typeof signatures !== "string") {
    throw new Error("Missing webhook-id, webhook-timestamp or webhook-signature header");
  }

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!(age <= TOLERANCE_SECONDS)) throw new Error("Timestamp outside the tolerance window");

  // HMAC-SHA256 of "id.timestamp.body", keyed with the base64-decoded part of the secret after "whsec_".
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.`).update(rawBody).digest();

  // The header is a space-separated list like "v1,<base64> v1,<base64>" (several while a secret is being rotated).
  const valid = signatures.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) return false;
    const received = Buffer.from(signature, "base64");
    // timingSafeEqual needs equal lengths; the length of a signature is not secret.
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
  if (!valid) throw new Error("Signature does not match");

  return JSON.parse(rawBody.toString("utf8"));
}
