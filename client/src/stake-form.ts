import { tableEconomy } from '../../src/shared/economy';

/** Only a minimum edit adjusts the suggestion; a person's later edit stays theirs. */
export function stakeFieldUpdates(
  key: string,
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  const minimum = Number(values.minBuyIn);
  return key === 'minBuyIn' &&
    Number.isSafeInteger(minimum) &&
    minimum > 0 &&
    minimum > Number(values.buyIn)
    ? { buyIn: values.minBuyIn }
    : {};
}

export function validateBuyIn(buyIn: number, min: number, max: number): void {
  if (buyIn < min)
    throw Error(
      `Your buy-in must be at least ${min.toLocaleString('en-US')} chips.`,
    );
  if (buyIn > max)
    throw Error(
      `Your buy-in must not exceed ${max.toLocaleString('en-US')} chips.`,
    );
}

export function validateStakeForm(
  gameType: string,
  values: Record<string, number>,
): void {
  if (values.minBuyIn > values.maxBuyIn)
    throw Error('Maximum buy-in must be at least the minimum buy-in.');
  tableEconomy(gameType, values);
  if (values.buyIn !== undefined)
    validateBuyIn(values.buyIn, values.minBuyIn, values.maxBuyIn);
}
