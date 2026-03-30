import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';

const styles = StyleSheet.create({
    page: {
        padding: 30,
        fontFamily: 'Helvetica',
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
    documentType: {
        fontSize: 10,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: 4,
    },
    headerRight: {
        alignItems: 'flex-end',
    },
    orderNo: {
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

    // Table Section
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
        alignItems: 'stretch',
        minHeight: 25,
    },
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

    // 9 Column Widths (Matches Sales Invoice)
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
    noteBox: {
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
    footerNote: {
        position: 'absolute',
        bottom: 20,
        left: 30,
        right: 30,
        textAlign: 'center',
        fontSize: 6,
        color: '#cbd5e1',
    }
});

interface PurchaseOrderPdfProps {
    order: any;
    companyName: string;
    currency: string;
}

export const PurchaseOrderPdf = ({ order, companyName, currency }: PurchaseOrderPdfProps) => {
    const items = order.items || [];
    const totalQty = items.reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0);

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.header} fixed>
                    <View>
                        <Text style={styles.companyName}>{companyName}</Text>
                        <Text style={styles.documentType}>Purchase Order</Text>
                    </View>
                    <View style={styles.headerRight}>
                        <Text style={styles.orderNo}>P.O. #{order.poNo}</Text>
                        <Text style={styles.issuedAt}>
                            Ordered: {format(new Date(order.date || order.createdAt), 'MMM dd, yyyy')}
                        </Text>
                    </View>
                </View>

                <View style={styles.addressGrid} fixed>
                    <View style={styles.addressBox}>
                        <Text style={styles.addressLabel}>SUPPLIER</Text>
                        <View style={{ lineHeight: 1.4 }}>
                            <Text style={styles.addressBold}>{order.supplier?.name || 'N/A'}</Text>
                            {order.supplier?.supplierCode && <Text>Code: {order.supplier.supplierCode}</Text>}
                            {order.supplier?.address && <Text>{order.supplier.address}</Text>}
                            {order.supplier?.phone && <Text>T: {order.supplier.phone}</Text>}
                        </View>
                    </View>
                    <View style={styles.addressBox}>
                        <Text style={styles.addressLabel}>DELIVER TO</Text>
                        <View style={{ lineHeight: 1.4 }}>
                            <Text style={styles.addressBold}>{companyName}</Text>
                            <Text>Branch: {order.branch?.name || '-'}</Text>
                            {order.branch?.address && <Text>{order.branch.address}</Text>}
                            {order.expectedDate && (
                                <View style={{ marginTop: 5 }}>
                                    <Text style={{ fontSize: 7, color: '#64748b' }}>EXPECTED DELIVERY</Text>
                                    <Text style={{ fontWeight: 'bold', fontSize: 8 }}>{format(new Date(order.expectedDate), 'PPP')}</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </View>

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
                        const unitExVat = Number(item.unitCost || 0);
                        const taxAmount = Number(item.taxAmount || 0);
                        const taxRate = Number(item.taxRate ?? item.product?.tax?.rate ?? item.product?.taxRate ?? 0.15);

                        const unitIncVat = unitExVat * (1 + taxRate);
                        const lineGrossExVat = qty * unitExVat;
                        const lineTotalIncVat = lineGrossExVat + taxAmount;

                        const unitObj = item.product?.units?.find((u: any) => String(u.unitCode) === String(item.unitCode));
                        const unitName = item.unitName || unitObj?.unitName || '-';
                        const fraction = Number(item.qtyInBaseUnit || item.fraction || unitObj?.qtyInBaseUnit || unitObj?.fraction || 1);

                        return (
                            <View key={idx} style={styles.tableRow} wrap={false}>
                                <View style={[styles.cell, styles.colSN]}><Text style={{ textAlign: 'center', fontSize: 7 }}>{idx + 1}</Text></View>
                                <View style={[styles.cell, styles.colItem]}>
                                    <Text style={styles.itemMain}>{item.product?.name || item.description}</Text>
                                    {item.product?.nameArabic && <Text style={styles.itemArabic}>{item.product.nameArabic}</Text>}
                                    <Text style={styles.itemCode}>{item.product?.itemCode || '-'}</Text>
                                </View>
                                <View style={[styles.cell, styles.colQty]}><Text style={{ textAlign: 'center', fontSize: 7 }}>{qty}</Text></View>
                                <View style={[styles.cell, styles.colUnitName]}>
                                    <Text style={{ textAlign: 'center', fontSize: 7, fontWeight: 'bold' }}>
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
                    <View style={styles.noteBox}>
                        {order.notes && (
                            <>
                                <Text style={styles.addressLabel}>INSTRUCTION NOTES</Text>
                                <Text style={{ fontSize: 7, color: '#475569', fontStyle: 'italic', marginBottom: 15 }}>{order.notes}</Text>
                            </>
                        )}
                        <Text style={styles.addressLabel}>AUTHORIZATION</Text>
                        <Text style={{ fontSize: 9, color: '#334155' }}>Issued by: <Text style={{ fontWeight: 'bold' }}>{order.createdBy?.name || '-'}</Text></Text>
                        <Text style={{ marginTop: 2, fontSize: 7, color: '#94a3b8' }}>Processed at {order.branch?.name || '-'}</Text>
                    </View>

                    <View style={styles.summaryBox}>
                        <Text style={styles.addressLabel}>Financial Summary</Text>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Total Quantity</Text>
                            <Text style={styles.summaryValue}>{totalQty}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Gross Total (Ex.Tax)</Text>
                            <Text style={styles.summaryValue}>{Number(order.subtotal).toFixed(2)} {currency}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Tax Amount (15%)</Text>
                            <Text style={styles.summaryValue}>{Number(order.taxTotal).toFixed(2)} {currency}</Text>
                        </View>
                        <View style={styles.netTotalRow}>
                            <Text style={styles.netTotalLabel}>ORDER TOTAL</Text>
                            <Text style={styles.netTotalValue}>{Number(order.grandTotal).toFixed(2)} {currency}</Text>
                        </View>
                    </View>
                </View>

                <View style={{ marginTop: 40, paddingTop: 10, borderTop: '0.5pt solid #e2e8f0', flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ width: '45%' }}>
                        <Text style={styles.addressLabel}>FOR SUPPLIER USE</Text>
                        <View style={{ marginTop: 10, height: 40, border: '0.5pt dashed #cbd5e1' }} />
                        <Text style={{ fontSize: 6, color: '#91a3b8', marginTop: 5 }}>Store Stamp & Receiver Signature</Text>
                    </View>
                    <View style={{ width: '45%' }}>
                        <Text style={styles.addressLabel}>FOR FINANCE USE</Text>
                        <View style={{ marginTop: 10, height: 40, border: '0.5pt dashed #cbd5e1' }} />
                        <Text style={{ fontSize: 6, color: '#91a3b8', marginTop: 5 }}>Audit Status & Approval</Text>
                    </View>
                </View>

                <Text style={styles.footerNote} fixed>
                    Official Purchase Order. System generated, no physical signature required. {companyName} ERP.
                </Text>
            </Page>
        </Document>
    );
};
