// See https://dots.statewalker.com/registry/index.html
export function newRegistry<E = unknown>(
  onError: (error: E) => void = console.error,
): [
  register: (callback?: () => void | Promise<void>) => () => Promise<void>,
  cleanup: () => Promise<void>,
] {
  const registrationsIndex: {
    [registrationId: number]: () => Promise<void>;
  } = {};
  let registrationId = 0;
  return [
    function register(
      listener?: () => void | Promise<void>,
    ): () => Promise<void> {
      const id = registrationId++;
      const cleanup = async () => {
        if (!(id in registrationsIndex)) {
          return;
        }
        delete registrationsIndex[id];
        try {
          await listener?.();
        } catch (e) {
          onError(e as E);
        }
      };
      registrationsIndex[id] = cleanup;
      return cleanup;
    },
    async function cleanup(): Promise<void> {
      const registrations = Object.values(registrationsIndex).reverse();
      for (const registration of registrations) {
        await registration();
      }
    },
  ];
}
