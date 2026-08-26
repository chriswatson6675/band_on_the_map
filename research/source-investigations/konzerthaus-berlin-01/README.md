# konzerthaus-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 30/40 venue collector-reuse trial. Konzerthaus Berlin
(Gendarmenmarkt, Mitte) publishes its programme at `konzerthaus.de/en/programm`.
The day-list page itself is plain static HTML (no embedded structured data),
but every individual event detail page it links to (`/en/programm/{slug}/{id}`)
embeds a clean schema.org `MusicEvent` JSON-LD block with name, startDate,
endDate, location, performer(s), and url — confirmed on two independently
sampled events (a symphony concert and a lunchtime "Espresso-Konzert").

Level 1 (`PASSIVE_STATIC`) alone was sufficient: no structural/browser
escalation was needed. This is a genuine fit for the project's existing,
reusable `ingestion/json-ld/` collector family — the only extra work versus
Moog Barcelona's single-page 37-event array is a first step to enumerate
event URLs from the day-list HTML before applying the same JSON-LD parser
per event page (recorded as a MINOR blocker, not a new family).

No offline-proof (`DETERMINISTIC_DERIVATION`) evidence item was produced in
this investigation — building/running collector or test code was explicitly
out of scope for this task. Decision is therefore `READY_FOR_OFFLINE_PROOF`,
not `READY_FOR_ACTIVATION`, pending that separate follow-up step.
