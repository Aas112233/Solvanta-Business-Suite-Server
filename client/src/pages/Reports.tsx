import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

// Sales
import SalesReport from '../components/reports/SalesReport';
import SalesInvoiceItemsReport from '../components/reports/SalesInvoiceItemsReport';

// General
import ItemPriceListReport from '../components/reports/ItemPriceListReport';
import VATReport from '../components/reports/VATReport';

// Stock
import InventoryCurrentStockReport from '../components/reports/InventoryCurrentStockReport';
import StockOnDateReport from '../components/reports/StockOnDateReport';
import CurrentStockInMultipleUnitReport from '../components/reports/CurrentStockInMultipleUnitReport';
import MovingNonMovingStockReport from '../components/reports/MovingNonMovingStockReport';
import CurrentStockInWarehousesReport from '../components/reports/CurrentStockInWarehousesReport';
import InventoryTransactionSummaryReport from '../components/reports/InventoryTransactionSummaryReport';
import RunningStockLedgerReport from '../components/reports/RunningStockLedgerReport';

// Purchases
import PurchaseInvoicesReport from '../components/reports/PurchaseInvoicesReport';
import PurchasesOnDateReport from '../components/reports/PurchasesOnDateReport';
import PurchasePaymentsReport from '../components/reports/PurchasePaymentsReport';
import PurchaseReturnsReport from '../components/reports/PurchaseReturnsReport';
import PurchaseOrderReport from '../components/reports/PurchaseOrderReport';

export default function Reports() {
    const { type } = useParams<{ type: string }>();

    const { data: branches = [] } = useQuery({
        queryKey: ['branches'],
        queryFn: () => api.get('/branches').then((r) => r.data.data),
    });

    switch (type) {
        // Sales
        case 'sales':
            return <SalesReport branches={branches} />;
        case 'sales-invoice-items':
            return <SalesInvoiceItemsReport />;

        // General
        case 'item-price-list':
            return <ItemPriceListReport />;
        case 'vat':
            return <VATReport />;

        // Stock
        case 'inventory-current-stock':
            return <InventoryCurrentStockReport />;
        case 'stock-on-date':
            return <StockOnDateReport />;
        case 'stock-multiple-unit':
            return <CurrentStockInMultipleUnitReport />;
        case 'moving-non-moving-stock':
            return <MovingNonMovingStockReport />;
        case 'stock-in-warehouses':
            return <CurrentStockInWarehousesReport />;
        case 'inventory-transaction-summary':
            return <InventoryTransactionSummaryReport />;
        case 'running-stock-ledger':
            return <RunningStockLedgerReport />;

        // Purchases
        case 'purchase-invoices':
            return <PurchaseInvoicesReport />;
        case 'purchases-on-date':
            return <PurchasesOnDateReport />;
        case 'purchase-payments':
            return <PurchasePaymentsReport />;
        case 'purchase-returns':
            return <PurchaseReturnsReport />;
        case 'purchase-order':
            return <PurchaseOrderReport />;

        // Fallback
        default:
            return <Navigate to="/reports/sales" replace />;
    }
}
