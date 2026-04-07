/** Shared proposal envelope returned by all Write Tools.
 *  Phase 3's HITL circuit renders these as Confirmation Cards. */
export interface ToolProposal<TPayload = unknown> {
  /** Unique proposal ID (generated UUID) */
  proposalId: string;
  /** The tool that generated this proposal */
  toolName: string;
  /** What this proposal would do, in plain English */
  description: string;
  /** The exact payload that would be executed on user confirmation */
  payload: TPayload;
  /** Version hash of underlying data at proposal time (for OCC in Phase 3) */
  dataVersion: string;
  /** Proposal type: "write" indicates this needs user confirmation */
  type: "write";
}
