# PROJECT SOUS: ARCHITECTURE CONSTITUTION

> The definitive guide to Sous's codebase structure, patterns, and conventions.

---

To improve context loading for AI coding agents and to make the codebase easier to digest, the architecture documentation has been split into focused, modular segments located in the `docs/architecture/` directory.

Before building features, adding models, or changing patterns, refer to the relevant document below:

## 📚 Table of Contents

### 1. [Data Models](docs/architecture/01-data-models.md)
Contains the schemas for all MongoDB/Mongoose models, including multi-tenancy rules (`orgId` and `locationId`), current scheduling models, and planned Phase 4 agentic models.

### 2. [Layer Patterns (The 3-Layer Architecture)](docs/architecture/02-layer-patterns.md)
Explains the defining rule of the codebase: UI calls Actions -> Actions validate and check auth -> Actions call Services -> Services query the Database. Also contains the Service Object Pattern and DTO conversions.

### 3. [UI and State Management](docs/architecture/03-ui-and-state.md)
Details the separation of Smart vs. Dumb components, how to handle TanStack Query data fetching, optimistic UI mutations, and shared frontend/backend Zod validation schemas.

### 4. [AI and Schedule Generation](docs/architecture/04-ai-and-scheduling.md)
Architectural explanation of the Phase 3 schedule generation feature, which relies on the `CandidateService` hard-filtering layer and the `CPSolverService` communicating with a Python OR-Tools constraint programming microservice.

### 5. [API Routes and Testing](docs/architecture/05-api-and-testing.md)
Mandates that `app/api/...` routes strictly serve as external webhooks (e.g., Twilio validation), and explains the `scripts/` end-to-end integration testing flow.

---
*Last Updated: March 2026*
