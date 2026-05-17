import { describe, expect, it } from "vitest";
import { BaseClass } from "../src/base-class.js";
import { waitForSettled } from "../src/wait-for-settled.js";

class SettleableModel extends BaseClass {
  private _settled = false;
  isSettled(): boolean {
    return this._settled;
  }
  finish(): void {
    this._settled = true;
    this.notify();
  }
}

describe("waitForSettled", () => {
  it("resolves immediately when already settled", async () => {
    const m = new SettleableModel();
    m.finish();
    expect(await waitForSettled(m)).toBe(m);
  });

  it("resolves after notify when isSettled flips to true", async () => {
    const m = new SettleableModel();
    const p = waitForSettled(m);
    m.finish();
    expect(await p).toBe(m);
  });
});
