import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { getSalesCustomerDisplay } from '../../lib/salesCustomerDisplay';
import { PDF_BASE_FONT_FAMILY, ensurePdfFontsRegistered, getPdfTextStyle } from '../../lib/pdfFonts';

ensurePdfFontsRegistered();

const styles = StyleSheet.create({
    page: {
        padding: 30,
        fontFamily: PDF_BASE_FONT_FAMILY,
        fontSize: 8,
        color: '#1e293b',
        backgroundColor: '#ffffff',
    },
    // Top Section: Header & Branding
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottom: '1pt solid #e2e8f0',
        paddingBottom: 15,
        marginBottom: 20,
    },
    companyName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    taxInvoiceLabel: {
        fontSize: 10,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: 2,
    },
    headerRight: {
        alignItems: 'flex-end',
    },
    invoiceNo: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#2563eb',
    },
    issuedAt: {
        marginTop: 4,
        color: '#64748b',
        fontSize: 7,
    },

    // Address Section
    addressGrid: {
        flexDirection: 'row',
        gap: 20,
        marginBottom: 25,
    },
    addressBox: {
        flex: 1,
    },
    addressLabel: {
        fontSize: 7,
        fontWeight: 'bold',
        color: '#94a3b8',
        textTransform: 'uppercase',
        marginBottom: 5,
        borderBottom: '0.5pt solid #f1f5f9',
        paddingBottom: 2,
    },
    addressBold: {
        fontWeight: 'bold',
        color: '#0f172a',
        fontSize: 9,
    },

    // Table Section with Borders
    table: {
        marginTop: 5,
        marginBottom: 20,
        border: '0.5pt solid #000000',
    },
    tableHeaderRow: {
        flexDirection: 'row',
        backgroundColor: '#f8fafc',
        borderBottom: '0.5pt solid #000000',
        alignItems: 'center',
        minHeight: 25,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottom: '0.5pt solid #000000',
        alignItems: 'stretch', // Ensures child columns stretch to full height for border lines
        minHeight: 25,
    },
    // Cell styling to create vertical lines
    cell: {
        padding: 4,
        borderRight: '0.5pt solid #000000',
        justifyContent: 'center',
    },
    cellLast: {
        padding: 4,
        justifyContent: 'center',
        borderRight: 'none',
    },

    // 9 Column Widths (Revised)
    colSN: { width: '4%', textAlign: 'center' },
    colItem: { width: '22%' },
    colQty: { width: '6%', textAlign: 'center' },
    colUnitName: { width: '13%', textAlign: 'center' },
    colPExVAT: { width: '10%', textAlign: 'right' },
    colPInVAT: { width: '10%', textAlign: 'right' },
    colTax: { width: '6%', textAlign: 'center' },
    colGross: { width: '14.5%', textAlign: 'right' },
    colTotal: { width: '14.5%', textAlign: 'right' },

    thText: {
        fontSize: 6,
        fontWeight: 'bold',
        color: '#475569',
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    itemMain: {
        fontWeight: 'bold',
        fontSize: 8,
        color: '#0f172a',
    },
    itemArabic: {
        fontSize: 7,
        color: '#334155',
        marginTop: 1,
    },
    itemCode: {
        fontSize: 5.5,
        color: '#94a3b8',
        marginTop: 1,
    },

    // Footer Section
    footerGrid: {
        flexDirection: 'row',
        marginTop: 10,
        gap: 30,
    },
    salesmanBox: {
        flex: 1,
    },
    summaryBox: {
        width: 180,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 3,
    },
    summaryLabel: {
        color: '#64748b',
        fontSize: 8,
    },
    summaryValue: {
        fontWeight: 'bold',
        color: '#0f172a',
        fontSize: 8,
    },
    netTotalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
        paddingTop: 8,
        borderTop: '1pt solid #e2e8f0',
    },
    netTotalLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    netTotalValue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#2563eb',
    },
});

interface InvoicePdfTemplateProps {
    invoice: any;
    companyName: string;
    currency: string;
}

export const InvoicePdfTemplate = ({ invoice, companyName, currency }: InvoicePdfTemplateProps) => {
    const items = invoice.items || [];
    const customerDisplay = getSalesCustomerDisplay(invoice);
    const totalQty = items.reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0);
    const subtotalExVat = Number(invoice.subtotal || 0);
    const taxTotal = Number(invoice.taxTotal || 0);
    const discountTotal = Number(invoice.discountTotal || 0);
    const loyaltyDiscountValue = Number(
        invoice.loyaltyDiscountValue
        ?? (Number(invoice.loyaltyPointsRedeemed || 0) * 0.005)
    );
    const totalDiscountValue = discountTotal + loyaltyDiscountValue;
    const netTotal = Number(invoice.grandTotal || 0);

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.header} fixed>
                    <View>
                        <Text style={[styles.companyName, getPdfTextStyle(companyName)]}>{companyName}</Text>
                        <Text style={styles.taxInvoiceLabel}>Final Tax Invoice / Sales Invoice</Text>
                    </View>
                    <View style={styles.headerRight}>
                        <Text style={styles.invoiceNo}>Invoice #{invoice.invoiceNo}</Text>
                        <Text style={styles.issuedAt}>
                            {format(new Date(invoice.createdAt), 'MMM dd, yyyy HH:mm')}
                        </Text>
                    </View>
                </View>

                <View style={styles.addressGrid} fixed>
                    <View style={styles.addressBox}>
                        <Text style={styles.addressLabel}>FROM SERVICE PROVIDER</Text>
                        <View style={{ lineHeight: 1.4 }}>
                            <Text style={[styles.addressBold, getPdfTextStyle(companyName)]}>{companyName}</Text>
                            <Text>Branch: <Text style={getPdfTextStyle(invoice.branch?.name)}>{invoice.branch?.name || '-'}</Text></Text>
                            {invoice.branch?.address && <Text style={getPdfTextStyle(invoice.branch.address)}>{invoice.branch.address}</Text>}
                            {invoice.branch?.phone && <Text>T: {invoice.branch.phone}</Text>}
                        </View>
                    </View>
                    <View style={styles.addressBox}>
                        <Text style={styles.addressLabel}>TO CUSTOMER</Text>
                        <View style={{ lineHeight: 1.4 }}>
                            <Text style={[styles.addressBold, getPdfTextStyle(customerDisplay.title)]}>{customerDisplay.title}</Text>
                            {customerDisplay.isWalkInLoyalty && <Text style={getPdfTextStyle(customerDisplay.detail)}>{customerDisplay.detail}</Text>}
                            {invoice.customer?.customerCode && <Text>Code: {invoice.customer.customerCode}</Text>}
                            {invoice.customer?.phone && <Text>T: {invoice.customer.phone}</Text>}
                            {invoice.customer?.email && <Text>E: {invoice.customer.email}</Text>}
                            {!customerDisplay.isWalkInLoyalty && !invoice.customer?.phone && invoice.loyaltyCustomer?.phone && <Text>T: {invoice.loyaltyCustomer.phone}</Text>}
                        </View>
                    </View>
                </View>

                {/* Grid-based Table with Borders */}
                <View style={styles.table}>
                    <View style={styles.tableHeaderRow} fixed>
                        <View style={[styles.cell, styles.colSN]}><Text style={styles.thText}>#</Text></View>
                        <View style={[styles.cell, styles.colItem]}><Text style={styles.thText}>Item Details</Text></View>
                        <View style={[styles.cell, styles.colQty]}><Text style={styles.thText}>Qty</Text></View>
                        <View style={[styles.cell, styles.colUnitName]}><Text style={styles.thText}>Unit & Pack</Text></View>
                        <View style={[styles.cell, styles.colPExVAT]}><Text style={styles.thText}>Unt.Prc. Ex.Tax</Text></View>
                        <View style={[styles.cell, styles.colPInVAT]}><Text style={styles.thText}>Unt.Prc. Inc.Tax</Text></View>
                        <View style={[styles.cell, styles.colTax]}><Text style={styles.thText}>Tax%</Text></View>
                        <View style={[styles.cell, styles.colGross]}><Text style={styles.thText}>Gross Ex.Tax</Text></View>
                        <View style={[styles.cellLast, styles.colTotal]}><Text style={styles.thText}>Total Inc.Tax</Text></View>
                    </View>

                    {items.map((item: any, idx: number) => {
                        const qty = Number(item.qty || 0);
                        const unitExVat = Number(item.unitPrice || 0);
                        const taxAmount = Number(item.taxAmount || 0);
                        const taxRate = Number(item.taxRate ?? item.product?.tax?.rate ?? item.product?.taxRate ?? 0);

                        const unitIncVat = unitExVat * (1 + taxRate);
                        const lineGrossExVat = Number(item.lineTotal || (qty * unitExVat));
                        const lineTotalIncVat = lineGrossExVat + taxAmount;
                        const unitObj = item.product?.units?.find((u: any) => String(u.unitCode) === String(item.unitCode));
                        const unitName = item.unitName || unitObj?.unitName || '-';
                        const fraction = Number(item.qtyInBaseUnit || item.fraction || unitObj?.qtyInBaseUnit || unitObj?.fraction || 1);

                        return (
                            <View key={idx} style={styles.tableRow} wrap={false}>
                                <View style={[styles.cell, styles.colSN]}><Text style={{ textAlign: 'center', fontSize: 7 }}>{idx + 1}</Text></View>
                                <View style={[styles.cell, styles.colItem]}>
                                    <Text style={[styles.itemMain, getPdfTextStyle(item.product?.name || item.description)]}>{item.product?.name || item.description}</Text>
                                    {item.product?.nameArabic && <Text style={[styles.itemArabic, getPdfTextStyle(item.product.nameArabic)]}>{item.product.nameArabic}</Text>}
                                    <Text style={styles.itemCode}>{item.product?.itemCode || '-'}</Text>
                                </View>
                                <View style={[styles.cell, styles.colQty]}><Text style={{ textAlign: 'center', fontSize: 7 }}>{qty}</Text></View>
                                <View style={[styles.cell, styles.colUnitName]}>
                                    <Text style={[{ textAlign: 'center', fontSize: 7, fontWeight: 'bold' }, getPdfTextStyle(unitName)]}>
                                        {unitName} x{fraction}
                                    </Text>
                                    <Text style={{ textAlign: 'center', fontSize: 6, color: '#64748b', marginTop: 2 }}>{item.unitCode}</Text>
                                </View>
                                <View style={[styles.cell, styles.colPExVAT]}><Text style={{ textAlign: 'right', fontSize: 7 }}>{unitExVat.toFixed(2)}</Text></View>
                                <View style={[styles.cell, styles.colPInVAT]}><Text style={{ textAlign: 'right', fontSize: 7 }}>{unitIncVat.toFixed(2)}</Text></View>
                                <View style={[styles.cell, styles.colTax]}><Text style={{ textAlign: 'center', fontSize: 7 }}>{(taxRate * 100).toFixed(0)}%</Text></View>
                                <View style={[styles.cell, styles.colGross]}><Text style={{ textAlign: 'right', fontSize: 7 }}>{lineGrossExVat.toFixed(2)}</Text></View>
                                <View style={[styles.cellLast, styles.colTotal]}><Text style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 7.5 }}>{lineTotalIncVat.toFixed(2)}</Text></View>
                            </View>
                        );
                    })}
                </View>

                <View style={styles.footerGrid}>
                    <View style={styles.salesmanBox}>
                        <Text style={styles.addressLabel}>Sales attribution</Text>
                        <Text style={{ fontSize: 9, color: '#334155' }}>Issued by: <Text style={[{ fontWeight: 'bold' }, getPdfTextStyle(invoice.createdBy?.name)]}>{invoice.createdBy?.name || '-'}</Text></Text>
                        <Text style={{ marginTop: 2, fontSize: 7, color: '#94a3b8' }}>Processed at <Text style={getPdfTextStyle(invoice.branch?.name)}>{invoice.branch?.name || '-'}</Text></Text>
                        <View style={{ marginTop: 15, width: 40, height: 40, backgroundColor: '#f8fafc', border: '0.5pt solid #e2e8f0', borderRadius: 4, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ fontSize: 4, color: '#cbd5e1' }}>QR</Text>
                        </View>
                    </View>

                    <View style={styles.summaryBox}>
                        <Text style={styles.addressLabel}>Financial Summary</Text>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Total Quantity</Text>
                            <Text style={styles.summaryValue}>{totalQty}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Gross Total (Ex.Tax)</Text>
                            <Text style={styles.summaryValue}>{subtotalExVat.toFixed(2)} {currency}</Text>
                        </View>
                        {discountTotal > 0 && (
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Total Discount</Text>
                                <Text style={[styles.summaryValue, { color: '#dc2626' }]}>- {discountTotal.toFixed(2)} {currency}</Text>
                            </View>
                        )}
                        {loyaltyDiscountValue > 0 && (
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Loyalty Discount</Text>
                                <Text style={[styles.summaryValue, { color: '#db2777' }]}>- {loyaltyDiscountValue.toFixed(2)} {currency}</Text>
                            </View>
                        )}
                        {totalDiscountValue > 0 && (
                            <View style={styles.summaryRow}>
                                <Text style={[styles.summaryLabel, { fontWeight: 'bold' }]}>Total Discount</Text>
                                <Text style={[styles.summaryValue, { color: '#be123c' }]}>- {totalDiscountValue.toFixed(2)} {currency}</Text>
                            </View>
                        )}
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Tax Amount</Text>
                            <Text style={styles.summaryValue}>{taxTotal.toFixed(2)} {currency}</Text>
                        </View>
                        <View style={styles.netTotalRow}>
                            <Text style={styles.netTotalLabel}>NET TOTAL</Text>
                            <Text style={styles.netTotalValue}>{netTotal.toFixed(2)} {currency}</Text>
                        </View>
                    </View>
                </View>

                <Text style={{ position: 'absolute', bottom: 20, left: 30, right: 30, textAlign: 'center', fontSize: 6, color: '#cbd5e1' }}>
                    System generated document. No signature required. <Text style={getPdfTextStyle(companyName)}>{companyName}</Text> ERP.
                </Text>
            </Page>
        </Document>
    );
};

export default InvoicePdfTemplate;
