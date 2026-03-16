# Agentic AI Scheduling Assistant

**Status**: Planning / Roadmap  
**Detailed Plan**: See `../../plans/AI_Assistant_Roadmap.md`

## Overview

The "Sous" Agentic AI Scheduling Assistant is an interactive, conversational AI agent that actively assists the manager in reviewing schedules, refining shifts, and managing team dynamics. 

Unlike prior automated approaches (like passive swap optimizers), this feature introduces a fully agentic assistant that managers collaborate with in a chat interface. Because workforce scheduling involves strict enterprise requirements (e.g., labor laws, preventing data corruption, handling long-running backend solvers), the system is built with a highly structured, bounded architecture designed to guarantee human-in-the-loop (HITL) execution.

## Architectural Phases

The roadmap for building the assistant is broken strictly into five phases to ensure safety, performance, and context boundaries. 

For full technical breakdowns and implementation strategies for each, please refer to the detailed [AI Assistant Roadmap](../../plans/AI_Assistant_Roadmap.md) doc and the associated `docs/ai-assistant/` folder:

1. **Phase 1: Security, Identity, and Context Boundaries**  
   Establishes dynamic Role-Based Access Control (RBAC) tool filtering and zero-trust viewport injection so the AI only uses tools the current user is legally permitted to execute.

2. **Phase 2: The Bounded Tool Registry (The "Pull" Architecture)**  
   Equips the LLM with strict, schematized data-gathering tools (Read Tools). This enforces data minimization and sanitization to prevent context window bloat and prompt injection.

3. **Phase 3: The Generative UI & Human-in-the-Loop (HITL) Circuit**  
   Prevents autonomous database mutation by streaming Interactive Confirmation Cards directly to the chat interface. Includes optimistic concurrency control to prevent stale actions.

4. **Phase 4: Asynchronous Task Orchestration**  
   Pairs the AI conversation securely with long-running, deterministic compute tasks (the CP-SAT solver) using a "fire and forget" architecture, avoiding serverless crash timeouts while allowing programmatic system follow-up triggers.

5. **Phase 5: Telemetry, Observability, and Audit Logging**  
   Provides a robust, immutable audit trail logging the `UserId`, the tool invoked, and the exact payload execution of every AI action to meet compliance standards and ease tracing.

*(Note: For the master product timeline, continue to refer to `plans/MASTER_ROADMAP.md`.)*
