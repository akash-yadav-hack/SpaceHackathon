# Antriksh AI — Mission Operations Copilot (ST-10)

Built by **Team ElectroCode** for **Techfest 2026–27 Space Technology Hackathon**[cite: 1, 2].

A local-first mission control assistant designed to cut down operator response time during spacecraft anomalies without relying on unverified LLM generations[cite: 3, 4, 6]. It correlates incoming telemetry alerts against flight SOPs and past incident logs to provide actionable steps with exact source citations and a tamper-evident audit log[cite: 5, 6].

---

## What Problem Are We Solving?

During an active anomaly (e.g. pressure drop in a thruster branch), flight operators typically have to parse through hundreds of pages of static PDF procedures while under extreme time pressure[cite: 3, 4]. 

Generic chat bots hallucinate steps that can brick onboard systems[cite: 3, 4]. **Antriksh AI** strictly enforces a **"No source, no advice"** rule: every recommended operational action must be backed by a verified reference from the flight manual or past incident post-mortems[cite: 5, 8].

---

## Core Features & Architecture
