/**
 * Centralized monetary calculation utilities for SOLVANTA ERP.
 *
 * ALL financial math MUST use these helpers. Raw float operations on money
 * values (Number(), parseFloat(), +, *, / without rounding) produce
 * floating-point artifacts that compound across transactions.
 *
 * Precision: 2 decimal places (cents). Multiply before rounding to avoid
 * intermediate precision loss from IEEE 754 binary floating point.
 */
export const MONEY_EPSILON = 0.001;

/** Round to 2 decimal places with epsilon compensation */
export function roundMoney(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Sum and round */
export function addMoney(...values: number[]): number {
    return roundMoney(values.reduce((sum, v) => sum + v, 0));
}

/** Multiply and round */
export function multiplyMoney(amount: number, qty: number): number {
    return roundMoney(amount * qty);
}

/** Subtract and round */
export function subtractMoney(a: number, b: number): number {
    return roundMoney(a - b);
}

/** Divide and round (for unit price calculations, etc.) */
export function divideMoney(numerator: number, denominator: number): number {
    if (denominator === 0) return 0;
    return roundMoney(numerator / denominator);
}
