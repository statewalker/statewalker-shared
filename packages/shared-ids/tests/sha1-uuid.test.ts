import { describe, expect, it } from "vitest";
import { sha1Bytes, sha1Uuid } from "../src/sha1-uuid.js";

describe("sha1Uuid", () => {
  it("produces a 40-character lowercase hex string", async () => {
    const hash = await sha1Uuid("hello");
    expect(hash).toHaveLength(40);
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("matches the SHA-1 reference value for 'hello'", async () => {
    expect(await sha1Uuid("hello")).toBe("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
  });

  it("matches the SHA-1 reference value for the empty string", async () => {
    expect(await sha1Uuid("")).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
  });

  it("is deterministic across repeated calls", async () => {
    const a = await sha1Uuid("statewalker");
    const b = await sha1Uuid("statewalker");
    expect(a).toBe(b);
  });

  it("differs for different inputs", async () => {
    const a = await sha1Uuid("a");
    const b = await sha1Uuid("b");
    expect(a).not.toBe(b);
  });
});

describe("sha1Bytes", () => {
  it("hashes raw bytes equivalently to sha1Uuid on the same UTF-8 input", async () => {
    const text = "hello";
    expect(await sha1Bytes(new TextEncoder().encode(text))).toBe(await sha1Uuid(text));
  });

  it("returns a 40-character lowercase hex string", async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4]);
    const hash = await sha1Bytes(bytes);
    expect(hash).toHaveLength(40);
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("accepts any Uint8Array and hashes only the view's bytes (#37)", async () => {
    const helloRef = "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d";
    const hello = new TextEncoder().encode("hello");

    const padded = new Uint8Array(hello.length + 4);
    padded.set(hello, 2);
    const view: Uint8Array = padded.subarray(2, 2 + hello.length);
    expect(await sha1Bytes(view)).toBe(helloRef);

    const shared = new Uint8Array(new SharedArrayBuffer(hello.length));
    shared.set(hello);
    expect(await sha1Bytes(shared)).toBe(helloRef);
  });
});
