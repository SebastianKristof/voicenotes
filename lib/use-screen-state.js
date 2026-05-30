import { useMemo, useState } from "react";

export const SCREEN_STATUS = {
  IDLE: "idle",
  LOADING: "loading",
  SUBMITTING: "submitting",
  SUCCESS: "success",
  ERROR: "error",
};

function toErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Unknown error";
}

export function useScreenState() {
  const [status, setStatus] = useState(SCREEN_STATUS.IDLE);
  const [activeAction, setActiveAction] = useState(null);
  const [error, setError] = useState("");

  const isBusy = useMemo(
    () => status === SCREEN_STATUS.LOADING || status === SCREEN_STATUS.SUBMITTING,
    [status],
  );

  function clearError() {
    setError("");
    if (status === SCREEN_STATUS.ERROR) {
      setStatus(SCREEN_STATUS.IDLE);
    }
  }

  async function runAction(action, fn, { phase = SCREEN_STATUS.SUBMITTING, rethrow = true } = {}) {
    setActiveAction(action);
    setStatus(phase);
    setError("");

    try {
      const result = await fn();
      setStatus(SCREEN_STATUS.SUCCESS);
      setActiveAction(null);
      return result;
    } catch (actionError) {
      setStatus(SCREEN_STATUS.ERROR);
      setActiveAction(null);
      setError(toErrorMessage(actionError));
      if (rethrow) throw actionError;
      return null;
    }
  }

  return {
    status,
    activeAction,
    error,
    isBusy,
    clearError,
    setError,
    runAction,
    setStatus,
  };
}
