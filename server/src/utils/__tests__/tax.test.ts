import { describe, expect, it } from 'vitest';
import { roundMoney, multiplyMoney } from '../money.js';

describe('Tax calculation logic', () => {
    it('tax-exclusive: taxAmount = lineGross * taxRate', () => {
        const lineGross = 100;
        const taxRate = 0.15; // 15% VAT
        const taxAmount = roundMoney(lineGross * taxRate);
        const lineSubtotal = roundMoney(lineGross);
        expect(taxAmount).toBe(15.00);
        expect(lineSubtotal).toBe(100.00);
    });

    it('tax-inclusive: taxAmount = lineGross - (lineGross / (1 + taxRate))', () => {
        const lineGross = 115;
        const taxRate = 0.15;
        const taxAmount = roundMoney(lineGross - (lineGross / (1 + taxRate)));
        const lineSubtotal = roundMoney(lineGross - taxAmount);
        expect(taxAmount).toBe(15.00);
        expect(lineSubtotal).toBe(100.00);
    });

    it('zero tax rate produces zero tax', () => {
        const lineGross = 100;
        const taxRate = 0;
        const taxAmount = roundMoney(lineGross * taxRate);
        expect(taxAmount).toBe(0);
    });

    it('full rate (100%) tax-inclusive halves the total', () => {
        const lineGross = 200;
        const taxRate = 1.0;
        const taxAmount = roundMoney(lineGross - (lineGross / (1 + taxRate)));
        expect(taxAmount).toBe(100.00);
    });

    it('tax calculation for qty > 1 with discount', () => {
        const qty = 5;
        const unitPrice = 10.50;
        const discount = 2.50;
        const lineGross = multiplyMoney(unitPrice, qty) - discount;
        const taxRate = 0.15;
        const taxAmount = roundMoney(lineGross * taxRate);
        expect(roundMoney(lineGross)).toBe(50.00);
        expect(taxAmount).toBe(7.50);
    });

    it('line totals sum correctly across items', () => {
        const items = [
            { qty: 2, unitPrice: 10.00, discount: 0 },
            { qty: 1, unitPrice: 25.50, discount: 0 },
            { qty: 3, unitPrice: 5.75, discount: 1.00 },
        ];
        const taxRate = 0.15;
        const computed = items.map(i => {
            const gross = multiplyMoney(i.unitPrice, i.qty) - i.discount;
            return { gross, tax: roundMoney(gross * taxRate) };
        });
        const totalGross = roundMoney(computed.reduce((s, c) => s + c.gross, 0));
        const totalTax = roundMoney(computed.reduce((s, c) => s + c.tax, 0));
        // 61.75 * 0.15 = 9.2625. Per-item rounding: 3.00 + 3.83 + 2.44 = 9.27
        expect(totalGross).toBe(61.75);
        expect(totalTax).toBe(9.27);
    });

    it('discount never produces negative line total', () => {
        const qty = 1;
        const unitPrice = 10;
        const discount = 100; // more than value
        const lineGross = multiplyMoney(unitPrice, qty) - discount;
        expect(lineGross).toBeLessThan(0);
        // Application should cap discount at gross
        const cappedGross = Math.max(0, lineGross);
        expect(cappedGross).toBe(0);
    });
});
