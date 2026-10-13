import { createInputController } from "./input-controller";
import type {
  ControllerOptions,
  EditPolicy,
  FormattingController,
  SuperDocInstance,
} from "../types";

const owners = new WeakMap<HTMLElement, FormattingController>();

export function createController(
  options: ControllerOptions,
  policy: EditPolicy,
  maintain?: (instance: SuperDocInstance) => Promise<void>,
): FormattingController {
  if (owners.has(options.element))
    throw new Error(
      "Enable only one formatting controller per editor container.",
    );
  let destroyed = false;
  let pending = false;
  let task: Promise<void> | null = null;
  const onError = (error: unknown) => {
    if (!destroyed) options.onError?.(error);
  };
  const onSuccess = () => {
    if (!destroyed) options.onSuccess?.();
  };
  const input = createInputController(
    { ...options, onError, onSuccess },
    policy,
  );

  function reconcile(): Promise<void> {
    if (destroyed || !maintain) return Promise.resolve();
    pending = true;
    if (!task) {
      task = (async () => {
        while (pending && !destroyed) {
          pending = false;
          const instance = options.getInstance();
          if (instance) await maintain(instance);
        }
        onSuccess();
      })()
        .catch((error: unknown) => {
          onError(error);
          throw error;
        })
        .finally(() => {
          task = null;
        });
    }
    return task;
  }

  const controller: FormattingController = {
    async flush() {
      await input.flush();
      await reconcile();
    },
    reconcile,
    resetSelection: input.resetSelection,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      pending = false;
      input.destroy();
      owners.delete(options.element);
    },
  };
  owners.set(options.element, controller);
  return controller;
}
