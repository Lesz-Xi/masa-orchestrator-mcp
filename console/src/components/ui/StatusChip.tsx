import type { TaskStatus } from "../../types/responses";

interface StatusChipProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusChip({ status, size = "sm" }: StatusChipProps) {
  return (
    <span
      className={`status-chip status-chip--${size}`}
      data-status={status}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
