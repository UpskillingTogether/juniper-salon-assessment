import { ApplicationFailure } from '@temporalio/activity';
// Simulated provider. offerId is the idempotency key a real SMS adapter must use.
export async function sendOffer(input: { offerId: string; name: string; fail: boolean }): Promise<void> {
  if (input.fail) throw ApplicationFailure.nonRetryable('Simulated text delivery failure. Contact the client or retry.', 'DeliveryFailure');
  console.log(`[SIMULATED SMS] Offer ${input.offerId} delivered to ${input.name}`);
}
