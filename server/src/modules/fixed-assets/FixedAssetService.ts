import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { formatDocNo, nextCounter } from '../../utils/documentCounter.js';
import { FixedAssetStatus, DepreciationMethod } from '@prisma/client';

export class FixedAssetService {
    /**
     * Calculates depreciation for a single asset based on its method and parameters.
     */
    static calculateDepreciationAmount(
        asset: {
            purchaseCost: number;
            salvageValue: number;
            usefulLifeMonths: number;
            depreciationMethod: DepreciationMethod;
            currentAccumDepreciation: number;
        }
    ): number {
        const remainingDepreciable = asset.purchaseCost - asset.salvageValue - asset.currentAccumDepreciation;
        if (remainingDepreciable <= 0) return 0;

        let amount = 0;
        if (asset.depreciationMethod === DepreciationMethod.STRAIGHT_LINE) {
            amount = (asset.purchaseCost - asset.salvageValue) / asset.usefulLifeMonths;
        } else if (asset.depreciationMethod === DepreciationMethod.DOUBLE_DECLINING) {
            const monthlyRate = 2 / asset.usefulLifeMonths;
            amount = (asset.purchaseCost - asset.currentAccumDepreciation) * monthlyRate;
        }

        // Round to 2 decimal places
        amount = Math.round(amount * 100) / 100;

        // Cap to remaining depreciable amount
        amount = Math.min(amount, remainingDepreciable);

        return amount;
    }

    /**
     * Registers a new fixed asset.
     */
    static async registerAsset(
        tx: any,
        data: {
            companyId: string;
            branchId?: string | null;
            assetCode?: string | null;
            name: string;
            description?: string | null;
            purchaseDate: Date;
            purchaseCost: number;
            salvageValue: number;
            usefulLifeMonths: number;
            depreciationMethod: DepreciationMethod;
            assetAccountId: string;
            accumDepAccountId: string;
            depExpAccountId: string;
        }
    ) {
        // Generate assetCode if not provided
        let code = data.assetCode?.trim();
        if (!code) {
            const next = await nextCounter(tx, data.companyId, 'FIXED_ASSET_CODE');
            code = formatDocNo('FA', next);
        }

        // Validate unique code
        const existing = await tx.fixedAsset.findFirst({
            where: { companyId: data.companyId, assetCode: code }
        });
        if (existing) {
            throw AppError.badRequest(`Fixed Asset with code '${code}' already exists`);
        }

        // Verify accounts exist
        const accountIds = [data.assetAccountId, data.accumDepAccountId, data.depExpAccountId];
        const uniqueAccountIds = [...new Set(accountIds)];
        const accounts = await tx.account.findMany({
            where: { id: { in: uniqueAccountIds }, companyId: data.companyId },
            select: { id: true }
        });
        if (accounts.length !== uniqueAccountIds.length) {
            throw AppError.badRequest('One or more GL accounts are invalid or do not belong to the company');
        }

        return tx.fixedAsset.create({
            data: {
                companyId: data.companyId,
                branchId: data.branchId || null,
                assetCode: code,
                name: data.name,
                description: data.description || null,
                purchaseDate: data.purchaseDate,
                purchaseCost: data.purchaseCost,
                salvageValue: data.salvageValue,
                usefulLifeMonths: data.usefulLifeMonths,
                depreciationMethod: data.depreciationMethod,
                assetAccountId: data.assetAccountId,
                accumDepAccountId: data.accumDepAccountId,
                depExpAccountId: data.depExpAccountId,
                status: FixedAssetStatus.ACTIVE,
                currentAccumDepreciation: 0,
            }
        });
    }

    /**
     * Run depreciation for a single asset.
     */
    static async runDepreciation(
        tx: any,
        fixedAssetId: string,
        depreciationDate: Date,
        postedById: string
    ) {
        const asset = await tx.fixedAsset.findUnique({
            where: { id: fixedAssetId }
        });

        if (!asset) {
            throw AppError.notFound('Fixed Asset not found');
        }

        if (asset.status !== FixedAssetStatus.ACTIVE) {
            throw AppError.badRequest(`Cannot run depreciation: Asset is in status '${asset.status}'`);
        }

        // Check if depreciation has already been run in this month
        const startOfMonth = new Date(depreciationDate.getFullYear(), depreciationDate.getMonth(), 1);
        const endOfMonth = new Date(depreciationDate.getFullYear(), depreciationDate.getMonth() + 1, 0, 23, 59, 59, 999);

        const existingLog = await tx.depreciationLog.findFirst({
            where: {
                fixedAssetId,
                depreciationDate: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            }
        });

        if (existingLog) {
            throw AppError.badRequest(`Depreciation has already been run for this asset in ${depreciationDate.toLocaleString('default', { month: 'long', year: 'numeric' })}`);
        }

        const amount = this.calculateDepreciationAmount(asset);
        if (amount <= 0) {
            // Mark fully depreciated and return
            const updatedAsset = await tx.fixedAsset.update({
                where: { id: fixedAssetId },
                data: { status: FixedAssetStatus.FULLY_DEPRECIATED }
            });
            return { asset: updatedAsset, amount: 0, journalEntryId: null, message: 'Asset is fully depreciated' };
        }

        // Post Journal Entry
        // Debit: Dep Expense, Credit: Accum Depreciation
        const next = await nextCounter(tx, asset.companyId, 'JOURNAL_ENTRY');
        const entryNo = formatDocNo('JE', next);
        const memo = `Depreciation run: ${asset.name} (${asset.assetCode}) - ${depreciationDate.toISOString().slice(0, 7)}`;

        const entry = await tx.journalEntry.create({
            data: {
                companyId: asset.companyId,
                branchId: asset.branchId || null,
                entryNo,
                date: depreciationDate,
                memo,
                sourceType: 'FIXED_ASSETS',
                sourceId: asset.id,
                postedById,
                lines: {
                    create: [
                        {
                            accountId: asset.depExpAccountId,
                            debit: amount,
                            credit: 0
                        },
                        {
                            accountId: asset.accumDepAccountId,
                            debit: 0,
                            credit: amount
                        }
                    ]
                }
            }
        });

        // Create DepreciationLog
        const log = await tx.depreciationLog.create({
            data: {
                companyId: asset.companyId,
                fixedAssetId: asset.id,
                depreciationDate,
                amount,
                journalEntryId: entry.id
            }
        });

        // Update FixedAsset accum dep
        const newAccumDep = Math.round((asset.currentAccumDepreciation + amount) * 100) / 100;
        const fullyDep = newAccumDep >= Math.round((asset.purchaseCost - asset.salvageValue) * 100) / 100;

        const updatedAsset = await tx.fixedAsset.update({
            where: { id: fixedAssetId },
            data: {
                currentAccumDepreciation: newAccumDep,
                status: fullyDep ? FixedAssetStatus.FULLY_DEPRECIATED : FixedAssetStatus.ACTIVE
            }
        });

        return { asset: updatedAsset, amount, journalEntryId: entry.id, log };
    }

    /**
     * Dispose of a fixed asset.
     */
    static async disposeAsset(
        tx: any,
        params: {
            fixedAssetId: string;
            disposalDate: Date;
            disposalAmount: number;
            disposalMemo: string;
            settlementAccountId: string;
            gainLossAccountId: string;
            postedById: string;
        }
    ) {
        const asset = await tx.fixedAsset.findUnique({
            where: { id: params.fixedAssetId }
        });

        if (!asset) {
            throw AppError.notFound('Fixed Asset not found');
        }

        if (asset.status === FixedAssetStatus.DISPOSED) {
            throw AppError.badRequest('Asset is already disposed');
        }

        // Validate GL Accounts exist
        const uniqueAccounts = [...new Set([params.settlementAccountId, params.gainLossAccountId])];
        const accounts = await tx.account.findMany({
            where: { id: { in: uniqueAccounts }, companyId: asset.companyId },
            select: { id: true }
        });
        if (accounts.length !== uniqueAccounts.length) {
            throw AppError.badRequest('One or more disposal GL accounts are invalid or do not belong to the company');
        }

        // Calculation:
        // Asset Cost: asset.purchaseCost
        // Accum Depreciation: asset.currentAccumDepreciation
        // Proceeds: params.disposalAmount
        // NBV = Cost - AccumDep
        // Gain/Loss = Proceeds - NBV
        const nbv = Math.round((asset.purchaseCost - asset.currentAccumDepreciation) * 100) / 100;
        const gainLoss = Math.round((params.disposalAmount - nbv) * 100) / 100;

        // Journal Entry balancing check:
        // Credit Asset Account (Cost)
        // Debit Accum Depreciation (Accumulated Depreciation)
        // Debit Settlement Account (Proceeds)
        // If Gain: Credit Gain/Loss (Positive gainLoss)
        // If Loss: Debit Gain/Loss (Negative gainLoss)
        const lines: any[] = [
            {
                accountId: asset.assetAccountId,
                debit: 0,
                credit: asset.purchaseCost
            }
        ];

        if (asset.currentAccumDepreciation > 0) {
            lines.push({
                accountId: asset.accumDepAccountId,
                debit: asset.currentAccumDepreciation,
                credit: 0
            });
        }

        if (params.disposalAmount > 0) {
            lines.push({
                accountId: params.settlementAccountId,
                debit: params.disposalAmount,
                credit: 0
            });
        }

        if (gainLoss > 0) {
            // Gain
            lines.push({
                accountId: params.gainLossAccountId,
                debit: 0,
                credit: gainLoss
            });
        } else if (gainLoss < 0) {
            // Loss
            lines.push({
                accountId: params.gainLossAccountId,
                debit: Math.abs(gainLoss),
                credit: 0
            });
        }

        const next = await nextCounter(tx, asset.companyId, 'JOURNAL_ENTRY');
        const entryNo = formatDocNo('JE', next);
        const memo = params.disposalMemo || `Asset Disposal: ${asset.name} (${asset.assetCode})`;

        const entry = await tx.journalEntry.create({
            data: {
                companyId: asset.companyId,
                branchId: asset.branchId || null,
                entryNo,
                date: params.disposalDate,
                memo,
                sourceType: 'FIXED_ASSETS_DISPOSAL',
                sourceId: asset.id,
                postedById: params.postedById,
                lines: {
                    create: lines
                }
            }
        });

        // Update fixed asset status
        const updatedAsset = await tx.fixedAsset.update({
            where: { id: params.fixedAssetId },
            data: {
                status: FixedAssetStatus.DISPOSED,
                disposalDate: params.disposalDate,
                disposalAmount: params.disposalAmount,
                disposalMemo: memo,
                disposalJournalId: entry.id
            }
        });

        return { asset: updatedAsset, journalEntryId: entry.id };
    }
}
