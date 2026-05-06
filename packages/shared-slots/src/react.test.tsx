import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { newSlot } from "./new-slot.js";
import { useSlot } from "./react.js";
import { Slots } from "./types.js";

interface Thing {
  id: string;
}

const [provideThing, observeThing] = newSlot<Thing>("test:thing");
const [provideOther] = newSlot<Thing>("test:other");

afterEach(() => {
  cleanup();
});

interface ProbeProps {
  slots: Slots;
}

function ThingsProbe({ slots }: ProbeProps): React.ReactElement {
  const renderCount = useRef(0);
  renderCount.current += 1;
  const things = useSlot(slots, observeThing);
  const lastRef = useRef<readonly Thing[]>(things);
  if (lastRef.current !== things) {
    lastRef.current = things;
  }
  return (
    <div data-testid="things" data-render-count={renderCount.current} data-len={things.length} />
  );
}

describe("useSlot", () => {
  it("re-renders when a related provider registers", () => {
    const slots = new Slots();
    const { getByTestId } = render(<ThingsProbe slots={slots} />);
    expect(getByTestId("things").getAttribute("data-len")).toBe("0");
    expect(getByTestId("things").getAttribute("data-render-count")).toBe("1");

    act(() => {
      provideThing(slots, { id: "a" });
    });
    expect(getByTestId("things").getAttribute("data-len")).toBe("1");
    expect(getByTestId("things").getAttribute("data-render-count")).toBe("2");
  });

  it("does not re-render when an unrelated provider registers", () => {
    const slots = new Slots();
    const { getByTestId } = render(<ThingsProbe slots={slots} />);
    expect(getByTestId("things").getAttribute("data-render-count")).toBe("1");

    act(() => {
      provideOther(slots, { id: "z" });
    });
    expect(getByTestId("things").getAttribute("data-render-count")).toBe("1");
    expect(getByTestId("things").getAttribute("data-len")).toBe("0");
  });

  it("returns a stable array reference between unrelated re-renders", () => {
    const slots = new Slots();
    let lastSeen: readonly Thing[] | null = null;
    let sameRefCount = 0;

    function ParentProbe(): React.ReactElement {
      const things = useSlot(slots, observeThing);
      if (lastSeen !== null && lastSeen === things) {
        sameRefCount += 1;
      }
      lastSeen = things;
      return <div />;
    }

    const { rerender } = render(<ParentProbe />);
    // Force a parent re-render with no slot mutation in between.
    rerender(<ParentProbe />);
    rerender(<ParentProbe />);
    expect(sameRefCount).toBeGreaterThanOrEqual(1);
  });

  it("releases the subscription on unmount", () => {
    const slots = new Slots();
    const { unmount } = render(<ThingsProbe slots={slots} />);
    unmount();
    // After unmount there should be no live observers; provide does not throw.
    expect(() => provideThing(slots, { id: "after-unmount" })).not.toThrow();
  });

  it("throws if observe was not produced by newSlot", () => {
    const slots = new Slots();
    const handRolled = ((s: Slots, cb: (v: Thing[]) => void) =>
      s.observe<Thing>("hand-rolled", cb)) as unknown as typeof observeThing;

    function BadProbe(): React.ReactElement {
      useSlot(slots, handRolled);
      return <div />;
    }

    expect(() => render(<BadProbe />)).toThrow(/observe function was not produced by newSlot/);
  });
});
