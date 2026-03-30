export interface ProductUnit {
    unitName: string;
    unitCode: string;
    qtyInBaseUnit: number;
    isBase: boolean;
}

/**
 * Decomposes a total quantity (in base units) into a human-friendly string 
 * using the available units of a product, from largest to smallest.
 * 
 * Example: Total 18 Pieces (Base) -> "1 Carton, 6 Piece"
 */
export function formatDecomposedQty(totalBaseQty: number, units: ProductUnit[]): string {
    if (totalBaseQty === 0) return '0';

    // Sort units by qtyInBaseUnit descending (largest units first)
    const sortedUnits = [...units].sort((a, b) => b.qtyInBaseUnit - a.qtyInBaseUnit);

    let remaining = totalBaseQty;
    const parts: string[] = [];

    for (const unit of sortedUnits) {
        if (unit.qtyInBaseUnit <= 0) continue;

        // If it's the base unit, take everything that's left
        if (unit.isBase || unit.qtyInBaseUnit === 1) {
            if (remaining > 0 || parts.length === 0) {
                const rounded = Math.round(remaining * 10000) / 10000;
                if (rounded > 0 || parts.length === 0) {
                    parts.push(`${rounded} ${unit.unitName}`);
                }
                remaining = 0;
            }
            break;
        }

        const wholeCount = Math.floor(remaining / unit.qtyInBaseUnit);

        if (wholeCount > 0) {
            parts.push(`${wholeCount} ${unit.unitName}`);
            remaining = Number((remaining % unit.qtyInBaseUnit).toFixed(4)); // Handle floating point issues
        }
    }

    // If we still have a remainder but no units left (shouldn't happen with a base unit), add it as raw
    if (remaining > 0) {
        parts.push(`${remaining} (Base)`);
    }

    return parts.length > 0 ? parts.join(', ') : '0';
}

/**
 * Normalizes a list of stock records for the same product/branch into one total base quantity.
 */
export function calculateTotalBaseQty(stockRecords: any[]): number {
    return stockRecords.reduce((acc, stock) => {
        const unit = stock.product?.units?.find((u: any) => u.unitCode === stock.unitCode);
        const multiplier = Number(unit?.qtyInBaseUnit || 1);
        return acc + (Number(stock.qtyOnHand) * multiplier);
    }, 0);
}
