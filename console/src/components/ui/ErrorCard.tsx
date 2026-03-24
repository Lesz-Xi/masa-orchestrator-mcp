type ErrorKind = "input" | "backend" | "auth" | "retryable" | "generic";

interface ErrorCardProps {
  error: string;
  kind?: ErrorKind;
  onDismiss?: () => void;
  onRetry?: () => void;
}

function classifyError(msg: string): ErrorKind {
  if (msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("session")) {
    return "auth";
  }
  if (msg.toLowerCase().includes("validation") || msg.toLowerCase().includes("required")) {
    return "input";
  }
  if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("network")) {
    return "retryable";
  }
  if (msg.toLowerCase().includes("remote") || msg.toLowerCase().includes("502")) {
    return "backend";
  }
  return "generic";
}

const KIND_LABELS: Record<ErrorKind, string> = {
  input: "Input error",
  backend: "Backend error",
  auth: "Auth error — reload to re-authenticate",
  retryable: "Network error — retry",
  generic: "Error",
};

export function ErrorCard({ error, kind, onDismiss, onRetry }: ErrorCardProps) {
  const resolved = kind ?? classifyError(error);
  return (
    <div className="error-card" data-kind={resolved} role="alert">
      <div className="error-card__header">
        <span className="error-card__label">{KIND_LABELS[resolved]}</span>
        {onDismiss && (
          <button className="error-card__dismiss" onClick={onDismiss} aria-label="Dismiss">
            ×
          </button>
        )}
      </div>
      <p className="error-card__message">{error}</p>
      {onRetry && resolved === "retryable" && (
        <button className="secondary-button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
