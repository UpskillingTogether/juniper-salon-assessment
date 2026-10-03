# Juniper Salon — Opening Concierge

When an appointment is canceled, Lena and Carla have a gap to fill. Today, they check a spreadsheet and text clients who have asked for an earlier visit. Keeping track of those replies takes time, and two people can say yes before staff have agreed who gets the appointment.

This prototype gives them a shared place to manage that process. Staff add an opening, and the app offers it to one eligible client at a time. It waits for their answer, moves on when needed, and closes the opening when someone accepts.

Lena's main priority is reliable follow-up without double-booking. Her business goal is to refill at least half of last-minute cancellations without repeatedly checking messages.

## Run it locally

You'll need **Node.js 20 or newer** and **Docker Desktop** running with Linux containers.

From the project folder, run:

```bash
npm install && npm run dev
```

In Windows PowerShell 5, run the commands separately:

```powershell
npm install
npm run dev
```

Open [Juniper Salon](http://localhost:3000). You can inspect its execution in [Temporal Web UI](http://localhost:8233), or use **View workflow** on the dashboard.

The startup command starts Temporal if it isn't already running, compiles the TypeScript code, and launches the API and Worker. It works on Windows without separate terminals for each service. If an older demo is using port 3000, stop it first.

Press **Ctrl+C** to stop the app and Worker. Run `npm run stop` to stop Temporal. Its Docker volume keeps recorded progress between runs.

## Take it for a spin

On a fresh waitlist, try a **Color appointment with Lena tomorrow at 2:00 PM**, lasting 90 minutes.

1. Ava gets the first offer. Click **Open client offer** to preview what she would see on her phone.
2. Decline the offer. Mia gets the next opportunity automatically.
3. Accept an offer. The client sees a confirmation, the opening closes, and their waitlist entry is marked booked.
4. Revisit an earlier offer link. It can no longer claim the appointment.

To see a timeout quickly, create another opening with **Fast demo** enabled. That uses a clearly labeled 20-second window. Normal same-day offers use 15 minutes; future appointments use the longer window chosen by staff.

You can also try **Simulate first text failing**. The opening pauses, names the affected client, and gives staff options to retry, record an answer after manual contact, or stop outreach.

**Stop outreach** invalidates the active offer when an opening disappears or a stylist becomes unavailable. **Fill directly** closes an opening for someone who contacts the salon themselves.

Sample data is persistent. If a client has already accepted or holds another offer, they will be skipped in later demonstrations.

## What Lena asked for

Clients must match the service, stylist preference, and availability for the whole appointment. Among eligible clients, the person who joined earliest gets the first offer. A client can hold only one active offer across the salon.

The reply deadline starts after successful delivery. Same-day openings use 15 minutes. Future openings require a window longer than 15 minutes, with a 60-minute default. The exact future window still needs to be agreed with Lena.

A decline or timeout moves to the next person automatically. Late replies cannot claim a slot. If nobody accepts, staff see that the opening is still **unfilled**.

The dashboard shows the opening, current recipient, deadline, and history. Clients see the service, stylist, date, time, and response deadline, with buttons to accept or decline. Acceptance records one winner, closes the opening, and removes that client from future offers.

Staff handle changes to the client's existing appointment in Square. The app shows a reminder, which they can mark complete.

## What Temporal does here

Temporal keeps track of the process while the salon waits for replies. Closing a browser doesn't lose an offer or its deadline.

One `salonWorkflow` coordinates the salon's openings and client reservations. Its Workflow ID is **juniper-salon-v1**, and its Task Queue is **juniper-salon**. Queries supply the dashboard and client pages. Updates handle replies and staff actions, with no await between final validation and booking changes, so competing actions cannot award the same opening twice.

Durable timers manage reply windows. The `sendOffer` Activity simulates text delivery. A failed send pauses outreach; a successful send starts the deadline. Cancellation is checked again after delivery so a send already in progress cannot reopen a stopped offer.

While outreach is active, a health Activity runs roughly every five seconds. A Worker restart or processing gap longer than 15 seconds pauses active offers when the system recovers. Staff see the affected client and original deadline. They can resend with a fresh window, record a manually confirmed answer, or stop outreach. The client cannot accept while review is pending.

Short server interruptions below that threshold may go undetected. During an outage, the browser reports that it cannot reach the workflow; the specific recovery warning appears once processing resumes.

## Check the behavior

```bash
npm run typecheck
npm test
```

The workflow tests cover offer order, client reservations, declines, timeouts, stale links, competing acceptance and cancellation, failed delivery, retry, manual responses, and recovery review. The recovery test also checks that an explicit resend keeps the same client and starts a fresh deadline.

Browser and API checks verified client acceptance, failure recovery, the direct workflow link, and rejection of future reply windows of 15 minutes or less. A live Worker restart produced the expected paused warning without advancing to another client.

Screenshots are in `evidence/`.

## What's simulated, and what's left for later

**No real texts are sent.** The prototype runs a delivery Activity, but uses simulated success or failure. **Open client offer** previews the local link. Real clients would need an SMS provider and a client-accessible website.

The waitlist contains six sample clients with daily availability ranges in Pacific time. It isn't connected to Google Sheets. Square updates are manual, as agreed with Lena. Direct bookings use a typed name, so staff still need to reconcile that person's waitlist entry.

This is a local demonstration without staff authentication. Before real client use, it needs staff login, secure offer links, consent and opt-out handling, and reliable SMS delivery and confirmation. Longer-term use also needs workflow history rollover and reporting.

The dashboard's refill percentage is illustrative: filled openings divided by filled or unfilled openings. It does **not** prove Lena's 50% business target has been met.

## A practical next step

Pilot the process with Lena and Carla using a small waitlist of clients who have agreed to receive offers. Settle the future-appointment reply window, connect real messaging, and track both refill rate and how often staff need to intervene.

Keep Square changes manual during that pilot. Use the results to decide whether a booking integration is worth adding.

For this assessment, the repository is public and the application runs locally. It is not deployed publicly.
