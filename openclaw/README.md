# OpenClaw Design Reference

This directory is retained as an architectural reference from the first operator design pass. OpenClaw is **not** the active Rate My Face operator runtime.

The active implementation is the closure-native builder harness documented in [`operator/HARNESS.md`](../operator/HARNESS.md), running on the existing Vercel + Supabase/Postgres stack.

Useful concepts retained from the OpenClaw design are typed tools, persistent sessions/state, bounded permissions, skills, heartbeats, and explicit execution receipts. Those concepts are implemented independently rather than by embedding or hosting the OpenClaw daemon.

The user-facing Rate My Face Custom GPT remains separate from the operator. The operator exists above the GPT fleet to build, test, deploy, measure, and improve GPT products.

Do not add OpenClaw credentials or daemon configuration unless a later experiment explicitly chooses to compare the native closure harness against an OpenClaw runtime.
