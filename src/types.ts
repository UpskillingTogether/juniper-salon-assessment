export type Service = 'Cut' | 'Color' | 'Blowout';
export type ClientEntry = { id: string; name: string; mobile: string; service: Service; stylist: string; fromHour: number; toHour: number; joinedAt: string; booked: boolean };
export type Offer = { id: string; clientId: string; clientName: string; status: 'sending' | 'waiting' | 'paused' | 'accepted' | 'declined' | 'expired' | 'canceled'; deadline?: number; previousDeadline?: number; pauseReason?: 'outage'; warning?: string };
export type Opening = { id: string; service: Service; stylist: string; startsAt: string; duration: number; responseMinutes: number; demo: boolean; failNext: boolean; status: 'searching' | 'offering' | 'paused' | 'filled' | 'unfilled' | 'stopped'; offers: Offer[]; history: { at: number; message: string }[]; bookedBy?: string; squarePending?: boolean };
export type SalonState = { clients: ClientEntry[]; openings: Opening[] };
export type Command = { action: 'create' | 'accept' | 'decline' | 'retry' | 'stop' | 'manualFill' | 'squareDone'; openingId: string; opening?: Opening; offerId?: string; manual?: boolean; name?: string };
export type CommandResult = { ok: boolean; message: string };
