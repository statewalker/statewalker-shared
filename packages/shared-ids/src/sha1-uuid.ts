/**
 * SHA1-based UUID generation for content-addressable blocks.
 *
 * Browser-compatible: uses crypto.subtle.digest (Web Crypto API).
 */

/**
 * Generate a SHA1-based UUID (v5-like) from the given content string.
 * The result is a lowercase hex string of the SHA1 hash (40 characters).
 */
export async function sha1Uuid(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-1", encoded);
  const hashArray = new Uint8Array(hashBuffer);
  return hexFromBytes(hashArray);
}

/**
 * Generate a SHA1 hash from raw bytes (any `Uint8Array`, including a Node `Buffer` or a view
 * into a larger or shared buffer; only the view's bytes are hashed).
 * The result is a lowercase hex string (40 characters).
 */
export async function sha1Bytes(data: Uint8Array): Promise<string> {
  // Web Crypto rejects views over a SharedArrayBuffer; copy those into a plain ArrayBuffer.
  const bytes =
    data.buffer instanceof ArrayBuffer ? (data as Uint8Array<ArrayBuffer>) : new Uint8Array(data);
  const hashBuffer = await crypto.subtle.digest("SHA-1", bytes);
  const hashArray = new Uint8Array(hashBuffer);
  return hexFromBytes(hashArray);
}

function hexFromBytes(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
