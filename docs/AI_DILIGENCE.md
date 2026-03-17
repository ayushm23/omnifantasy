# AI Use Diligence Statement

**Project:** OmniFantasy — Multi-Sport Fantasy League Platform
**Author:** Ayush Mittal
**Date:** March 2026

---

## AI Systems Used

This project was developed with the assistance of two AI coding tools:

- **Claude Code** (Anthropic, claude-sonnet-4-6 / claude-opus-4-6) — the primary AI assistant, used throughout development via the Claude Code CLI embedded in the development environment
- **OpenAI Codex** (via the OpenAI API) — used as a supplementary tool when Claude Code was temporarily unavailable due to rate limits or subscription constraints

Claude Code was the dominant contributor. Codex served as a fallback and did not have a materially different role — both were used under the same directed, review-first workflow described below.

---

## How AI Contributed

Claude Code played a substantial role in the implementation of this project. Working under my direction, the AI:

- **Wrote and iterated on code** across the full stack: React components, custom hooks, Supabase client logic, Edge Functions (Deno/TypeScript), and database migrations
- **Debugged and diagnosed** issues including race conditions in draft state, timer pause logic, and real-time subscription edge cases
- **Designed and documented** architectural patterns (EP calculation model, queue auto-pick system, golf/tennis scoring overhaul, deep-link OTC email flow)
- **Generated tests** for core utilities (`draft.js`, `points.js`, `aliases.js`, `format.js`) using Vitest
- **Drafted documentation** including `CLAUDE.md`, `docs/EP_METHODOLOGY.md`, and `docs/ARCHITECTURE.md`

The AI did not make independent product decisions. All feature choices, scope, prioritization, and architectural direction were determined by me. The AI implemented what I specified.

---

## Review Process

I reviewed all AI-generated code before it became part of the working application. My review process included:

- **Reading and understanding** each change before accepting it — I did not apply AI output blindly
- **Manual testing** of features in a live Supabase environment, including draft flow, timer behavior, EP display, standings calculation, and email triggers
- **User testing** conducted with a small group of friends who used the app as real league participants, surfacing bugs and usability issues that were subsequently fixed
- **Iterative correction** — when AI output was wrong, incomplete, or failed tests, I directed it to revise rather than accepting the first result
- **Maintaining a living `CLAUDE.md`** to enforce consistent patterns, naming conventions, and architectural rules across sessions

---

## Responsibility Assertion

I am the sole author and owner of this project. I take full responsibility for all code, design decisions, and content in this repository — including the portions drafted with AI assistance. The AI was a tool I directed; the judgment, oversight, and accountability are entirely mine.

This project has not been submitted to any academic institution. It is a personal side project built for fun and shared with friends, with ambitions for broader use. There are no client obligations or contractual representations involved at this stage.

---

## Context-Specific Considerations

**On the nature of AI-heavy development:** A significant portion of the implementation code was written by AI under my direction. I believe this is an honest and legitimate way to build software, provided the developer understands what the code does, takes responsibility for it, and maintains meaningful oversight — all of which I have done here.

**On future use:** As this project evolves toward a more public or professional context (e.g., open sourcing, user growth, monetization, or team collaboration), I intend to keep this statement current and disclose AI use clearly to any relevant stakeholders.

**On what AI cannot replace:** The product vision, the sports domain knowledge, the user feedback loop, the debugging judgment calls, and the decisions about what *not* to build all came from me. The AI accelerated implementation; it did not substitute for thinking.

---

*This statement was drafted collaboratively with Claude Code and reviewed and approved by the project author.*
