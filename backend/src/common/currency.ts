export const SUPPORTED_CURRENCIES = ['EUR', 'LEI', 'USD'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const EUR_CONVERSION_RATES: Record<SupportedCurrency, number> = {
  EUR: 1,
  LEI: 0.2,
  USD: 0.92
};

export function isSupportedCurrency(currency: string): currency is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(currency as SupportedCurrency);
}

export function convertToEur(amount: number, currency: string): number {
  if (!isSupportedCurrency(currency)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  return amount * EUR_CONVERSION_RATES[currency];
}
