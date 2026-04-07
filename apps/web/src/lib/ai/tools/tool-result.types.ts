/** Standardized envelope for all tool execution results */
export interface ToolResult<TData = unknown> {
  /** Whether the execution succeeded */
  success: boolean;
  /** The tool name that was executed */
  toolName: string;
  /** The aggregated, token-efficient result data (only on success) */
  data?: TData;
  /** Human-readable error message (only on failure) */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?:
    | "VALIDATION_FAILED"
    | "EXECUTION_FAILED"
    | "PERMISSION_DENIED"
    | "NOT_FOUND";
}
