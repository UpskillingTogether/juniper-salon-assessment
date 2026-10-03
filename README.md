# Juniper Salon · Opening concierge

A local Temporal prototype based on Lena's customer interview. Staff enter canceled appointments; the system offers them to eligible waitlist clients one at a time, in join order, without repeatedly checking texts.

## Run

Requires Node.js 20+ and Docker Desktop running with Linux containers.

```bash
npm install && npm run dev
```

On Windows PowerShell 5, run `npm install` followed by `npm run dev` (or use `npm install; if ($LASTEXITCODE -eq 0) { npm run dev }`).

Open http://localhost:3000. Temporal Web UI: http://localhost:8233.
The launch script starts the persisted Docker Temporal server, Worker and API; it spawns Node directly to support Windows.
Stop the API/Worker with Ctrl+C. `npm run stop` stops Temporal without deleting its data volume. Restarting preserves recorded outreach and pauses active offers for staff review; sample data is initialized only for a new salon workflow.
If old demo terminals occupy port 3000, stop those first.

## Quick demonstration

1. Create a Color appointment with Lena tomorrow at 14:00, duration 90 minutes.
2. Ava receives the first offer. Open **Open client offer** to see the phone-friendly appointment details and deadline.
3. Decline: Mia receives the next offer automatically. Accept: the slot closes, the client is marked off the waitlist, and staff see a Square follow-up reminder.
4. Try the old offer link: it cannot claim the slot. Repeat an accepted request: the same confirmation is returned.
5. Create another opening on a different date with **Fast demo** checked. Its reply window is 20 seconds rather than the real 15 minutes; leave it unanswered to see timeout progression.
6. Select **Simulate first text failing**. The opening pauses visibly with no deadline. Retry delivery, record a manual answer, or stop outreach.
7. **Stop outreach** cancels the active offer immediately. **Fill directly** closes the opening for a direct booking.
8. Create simultaneous openings on different dates. A client already holding an active offer is reserved across the salon. Overlapping openings for the same stylist are rejected.

## Confirmed customer rules

- Eligibility: service, stylist preference (or Any), and the entire appointment fits general availability.
- Earliest joined eligible and unreserved client first; only one active offer per client.
- Same-day reply window: 15 minutes. Future windows must be 16–1440 minutes and are chosen by staff (60-minute form default is an assumption, not an agreed policy).
- Deadline begins only after successful sending, and never extends beyond appointment start.
- Decline or timeout advances automatically. Exhaustion is explicitly unfilled.
- Acceptance records the winner, closes the opening and marks the client booked in one durable operation.
- Stop/cancel and manual fill invalidate the outstanding link.
- Failed delivery pauses outreach and retains the reservation. Staff can retry or record accept/decline after manual contact.
- Staff see current recipient, deadline, history, unfilled state and Square follow-up.
- Goal: refill at least half of last-minute cancellations without repeated staff checks. Dashboard rate is an illustrative prototype metric (filled / filled-or-unfilled), not evidence of business impact.

## How Temporal is used

`salonWorkflow` is a single durable salon coordinator, Workflow ID **juniper-salon-v1**, Task Queue **juniper-salon**. Its Query supplies staff/client views. Update handlers return explicit success/rejection and serialize acceptance, stop, manual fill and global client reservation. Reply handlers check recovery through an Activity first, then perform validation and mutations without an intervening await.

The main loop uses durable `condition` timers for deadlines, and `sendOffer` Activities for simulated delivery. A failed Activity becomes a visible paused offer instead of silently advancing. A successful Activity starts the timer. The workflow checks cancellation again after delivery, so an in-flight send cannot reactivate a canceled offer.

Progress lives in Temporal event history and the Docker SQLite volume, not browser memory. While outreach is active, a health Activity runs approximately every 5 seconds. A newer Worker startup timestamp or a processing gap longer than 15 seconds pauses active offers on recovery. Short server interruptions below this threshold may not be distinguishable from normal scheduling. The recipient reservation stays held; the original deadline is retained for staff reference. Client acceptance is blocked during review. Staff can resend the same offer with a fresh window beginning after successful delivery, record a manually confirmed answer, or stop outreach. The first monitoring check also conservatively pauses any active offer inherited from the previous code version.

## Verification

```bash
npm run typecheck
npm test
```

The Temporal time-skipping integration test exercises FIFO, global reservations, decline, timeout, old-link rejection, concurrent close actions, idempotent acceptance, pause/retry, manual response, cancellation and Square follow-up. Browser checks cover creating an opening, failed delivery warning, retry and client acceptance. A live Worker restart paused the same client offer with an outage warning and no automatic progression. The recovery integration test checks blocked acceptance and explicit resend with a new deadline. API checks reject a future 15-minute window and accept 16 minutes.

Screenshots are under `evidence/`.

## Simulated and excluded

- No real SMS is sent. Delivery is a real Temporal Activity with simulated success/failure; client links open locally. A real provider needs offer-ID idempotency, delivery receipts and confirmation delivery.
- Waitlist uses six sample clients; availability is a daily Pacific-time hour range, on all dates. There is no Google Sheets or Square integration.
- Staff update existing appointments in Square manually; the prototype never claims to perform that update.
- Local-only, unauthenticated demo. Production needs staff authentication, signed high-entropy offer tokens, consent/opt-out handling and provider credentials before real client use.
- A single coordinator is appropriate for this small prototype, but it has no history rollover, archival or long-term reporting. Add continue-as-new and storage boundaries for sustained production use.
- Direct bookings are entered as free text; staff coordinate existing appointments and waitlist identity manually.

## Practical next step

Pilot with Lena and Carla using a small opted-in waitlist. Agree on the future-appointment reply window, integrate an SMS provider with idempotent delivery and failure monitoring, and add staff login. Track refill rate and staff touches over two weeks before automating Square changes.

No public app deployment is required or performed.
