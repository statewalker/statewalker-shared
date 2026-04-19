export function onChange(
  onUpdate: (callback: () => void) => () => void,
  callback: () => void,
  getValue: () => unknown,
): () => void {
  return onChangeNotifier(onUpdate, getValue)(callback);
}

export function onChangeNotifier(
  onUpdate: (callback: () => void) => () => void,
  getValue: () => unknown,
): (callback: () => void) => () => void {
  return (callback: () => void) => {
    let prev = getValue();
    return onUpdate(() => {
      const next = getValue();
      if (prev !== next) {
        prev = next;
        callback();
      }
    });
  };
}
