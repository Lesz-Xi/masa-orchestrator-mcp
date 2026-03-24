import { TaskCard } from "../ui/TaskCard";
import { SkeletonPanel } from "../ui/SkeletonPanel";
import type { DashboardDataState } from "../../hooks/useDashboardData";
import type { ToolExecutionState } from "../../hooks/useToolExecution";
import type { DelegationAgent } from "../../types/responses";

interface DelegationViewProps {
  dashboard: DashboardDataState;
  toolExec: ToolExecutionState;
  onRefresh: () => Promise<void>;
}

export function DelegationView({ dashboard, toolExec, onRefresh }: DelegationViewProps) {
  const { delegation, loading } = dashboard;

  async function handleTransition(
    taskId: string,
    newStatus: string,
    agent: DelegationAgent,
    notes: string,
    confirmed: boolean
  ) {
    await toolExec.execute(
      "delegation_chain_state",
      { action: "update", taskId, newStatus, agent, notes },
      confirmed
    );
    await onRefresh();
  }

  return (
    <section className="workspace-stack">
      <div className="section-heading">
        <div>
          <div className="meta-chip">Delegation / live state</div>
          <h2>Task and blocker ledger</h2>
        </div>
        <button
          className="secondary-button"
          onClick={() => void onRefresh()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh queues"}
        </button>
      </div>

      <div className="panel-grid">
        <article className="panel-card">
          <header>
            <div>
              <h3>Active tasks</h3>
              <p>Status, ownership, and transition history.</p>
            </div>
          </header>

          {loading && !delegation ? (
            <SkeletonPanel lines={5} />
          ) : delegation && delegation.tasks.length > 0 ? (
            <div className="task-list">
              {delegation.tasks.map((task) => (
                <TaskCard
                  key={task.taskId}
                  task={task}
                  onTransition={handleTransition}
                />
              ))}
            </div>
          ) : (
            <div className="empty-card">No delegation tasks recorded yet.</div>
          )}
        </article>

        <article className="panel-card">
          <header>
            <div>
              <h3>Blockers</h3>
              <p>Outstanding items preventing clean consolidation.</p>
            </div>
          </header>
          {delegation && delegation.blockers.length > 0 ? (
            <ol className="blocker-list">
              {delegation.blockers.map((blocker, i) => (
                <li key={i} className="blocker-list__item">
                  {blocker}
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-card success">
              No active blockers. Consolidation path is clear.
            </div>
          )}

          {delegation && delegation.pipeline && (
            <div className="pipeline-summary">
              <div className="meta-chip" style={{ marginBottom: "12px" }}>Pipeline queues</div>
              <div className="pipeline-queues">
                <div className="pipeline-queue">
                  <span className="pipeline-queue__label">Think</span>
                  <span className="pipeline-queue__count">
                    {delegation.pipeline.thinkQueue.length}
                  </span>
                </div>
                <div className="pipeline-queue">
                  <span className="pipeline-queue__label">Act</span>
                  <span className="pipeline-queue__count">
                    {delegation.pipeline.actQueue.length}
                  </span>
                </div>
                <div className="pipeline-queue">
                  <span className="pipeline-queue__label">Verify</span>
                  <span className="pipeline-queue__count">
                    {delegation.pipeline.verifyQueue.length}
                  </span>
                </div>
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
