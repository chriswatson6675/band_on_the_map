# frannz-club-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of a Berlin 6-venue reuse trial. Frannz Club's homepage is a large,
fully server-rendered WordPress page with each upcoming show as its own
`events` custom-post-type block — day name, day number, month NAME, and
Einlass/Beginn times are all real, structured text (Level 1 PASSIVE_STATIC).
No calendar-plugin REST route exists (`tribe/events` and `wp/v2/events` both
404 — Level 2 STRUCTURAL, INSUFFICIENT).

The one genuine gap, honestly recorded rather than papered over: **no event
anywhere states a year**. Per `docs/SOURCE_INVESTIGATION_POLICY.md`'s v1.2
field-basis rules, inferring the year from today's date would be
`AI_INFERENCE` and can never be `PROVEN`, so `start_date` stays honestly
`PARTIAL`. This is flagged as a MAJOR blocker for a human/product decision
before collector-build, not silently guessed around.

Decision: `READY_FOR_OFFLINE_PROOF` — title and time are solidly PROVEN, a
real bounded evidence sample is retained, and the year gap is explicit
follow-up work rather than a reason to DEFER a candidate that is otherwise
genuinely acquirable.
