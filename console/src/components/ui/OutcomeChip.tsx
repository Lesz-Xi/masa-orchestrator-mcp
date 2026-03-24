import type { ActivityOutcome } from "../../types/responses";

interface OutcomeChipProps {
  outcome: ActivityOutcome | string;
}

export function OutcomeChip({ outcome }: OutcomeChipProps) {
  return (
    <span className="outcome-chip" data-outcome={outcome}>
      {outcome.replace(/_/g, " ")}
    </span>
  );
}
