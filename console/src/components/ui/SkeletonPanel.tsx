interface SkeletonPanelProps {
  lines?: number;
  height?: number;
}

export function SkeletonPanel({ lines = 3, height }: SkeletonPanelProps) {
  if (height) {
    return (
      <div
        className="skeleton skeleton-panel"
        style={{ height }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="skeleton-block" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{ width: `${85 - i * 12}%` }}
        />
      ))}
    </div>
  );
}
