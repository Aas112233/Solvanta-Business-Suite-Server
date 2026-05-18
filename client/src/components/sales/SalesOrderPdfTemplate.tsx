import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';
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
    docLabel: {
        fontSize: 10,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: 2,
    },
    headerRight: {
        alignItems: 'flex-end',
    },
    docNo: {
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

    // 5 Columns for Sales Order
    colSN: { width: '5%', textAlign: 'center' },
    colItem: { width: '45%' },
    colQty: { width: '10%', textAlign: 'center' },
    colPrice: { width: '15%', textAlign: 'right' },
    colTotal: { width: '25%', textAlign: 'right' },

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
    itemSmall: {
        fontSize: 7,
        color: '#64748b',
        marginTop: 1,
    },

    // Footer
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

interface SalesOrderPdfTemplateProps {
    order: any;
    companyName: string;
    currency: string;
}

export const SalesOrderPdfTemplate = ({ order, companyName, currency }: SalesOrderPdfTemplateProps) => {
    const items = order.items || [];
    const totalQty = items.reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0);
    const subtotal = Number(order.subtotal || 0);
    const taxTotal = Number(order.taxTotal || 0);
    const grandTotal = Number(order.grandTotal || 0);

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.header} fixed>
                    <View>
                        <Text style={[styles.companyName, getPdfTextStyle(companyName)]}>{companyName}</Text>
                        <Text style={styles.docLabel}>Sales Order</Text>
                    </View>
                    <View style={styles.headerRight}>
                        <Text style={styles.docNo}>Order #{order.orderNo}</Text>
                        <Text style={styles.issuedAt}>
                            {format(new Date(order.date), 'MMM dd, yyyy')}
                        </Text>
                    </View>
                </View>

                <View style={styles.addressGrid} fixed>
                    <View style={styles.addressBox}>
                        <Text style={styles.addressLabel}>Bill To</Text>
                        <View style={{ lineHeight: 1.4 }}>
                            <Text style={[styles.addressBold, getPdfTextStyle(order.customer?.name || order.customerName || 'Walk-in Customer')]}>{order.customer?.name || order.customerName || 'Walk-in Customer'}</Text>
                            {order.customer?.phone && <Text>T: {order.customer.phone}</Text>}
                            {order.customer?.email && <Text>E: {order.customer.email}</Text>}
                        </View>
                    </View>
                    {order.branch && (
                        <View style={styles.addressBox}>
                            <Text style={styles.addressLabel}>From Branch</Text>
                            <View style={{ lineHeight: 1.4 }}>
                                <Text style={[styles.addressBold, getPdfTextStyle(order.branch.name)]}>{order.branch.name}</Text>
                                {order.branch.code && <Text>Code: {order.branch.code}</Text>}
                            </View>
                        </View>
                    )}
                </View>

                <View style={styles.table}>
                    <View style={styles.tableHeaderRow} fixed>
                        <View style={[styles.cell, styles.colSN]}><Text style={styles.thText}>#</Text></View>
                        <View style={[styles.cell, styles.colItem]}><Text style={[styles.thText, { textAlign: 'left', paddingLeft: 4 }]}>Description</Text></View>
                        <View style={[styles.cell, styles.colQty]}><Text style={styles.thText}>Qty</Text></View>
                        <View style={[styles.cell, styles.colPrice]}><Text style={styles.thText}>Unit Price</Text></View>
                        <View style={[styles.cellLast, styles.colTotal]}><Text style={styles.thText}>Total</Text></View>
                    </View>

                    {items.map((item: any, idx: number) => (
                        <View key={idx} style={styles.tableRow} wrap={false}>
                            <View style={[styles.cell, styles.colSN]}><Text style={{ textAlign: 'center', fontSize: 7 }}>{idx + 1}</Text></View>
                            <View style={[styles.cell, styles.colItem]}>
                                <Text style={[styles.itemMain, getPdfTextStyle(item.description)]}>{item.description}</Text>
                                {item.unitCode && <Text style={[styles.itemSmall, getPdfTextStyle(item.unitCode)]}>{item.unitCode}</Text>}
                            </View>
                            <View style={[styles.cell, styles.colQty]}><Text style={{ textAlign: 'center', fontSize: 7 }}>{item.qty}</Text></View>
                            <View style={[styles.cell, styles.colPrice]}><Text style={{ textAlign: 'right', fontSize: 7 }}>{Number(item.unitPrice).toFixed(2)}</Text></View>
                            <View style={[styles.cellLast, styles.colTotal]}><Text style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 7.5 }}>{Number(item.lineTotal).toFixed(2)}</Text></View>
                        </View>
                    ))}
                </View>

                <View style={styles.footerGrid}>
                    <View style={styles.salesmanBox}>
                        <Text style={styles.addressLabel}>Notes</Text>
                        <Text style={[{ fontSize: 8, color: '#334155', marginTop: 2 }, getPdfTextStyle(order.notes || 'No notes')]}>{order.notes || 'No notes'}</Text>

                        <Text style={[styles.addressLabel, { marginTop: 15 }]}>Terms & Conditions</Text>
                        <Text style={[{ fontSize: 8, color: '#334155', marginTop: 2 }, getPdfTextStyle(order.terms || 'Standard terms apply.')]}>{order.terms || 'Standard terms apply.'}</Text>
                    </View>

                    <View style={styles.summaryBox}>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Total Quantity</Text>
                            <Text style={styles.summaryValue}>{totalQty}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Subtotal</Text>
                            <Text style={styles.summaryValue}>{subtotal.toFixed(2)} {currency}</Text>
                        </View>
                        {taxTotal > 0 && (
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Tax</Text>
                                <Text style={styles.summaryValue}>{taxTotal.toFixed(2)} {currency}</Text>
                            </View>
                        )}
                        <View style={styles.netTotalRow}>
                            <Text style={styles.netTotalLabel}>TOTAL</Text>
                            <Text style={styles.netTotalValue}>{grandTotal.toFixed(2)} {currency}</Text>
                        </View>
                    </View>
                </View>

                <Text style={{ position: 'absolute', bottom: 20, left: 30, right: 30, textAlign: 'center', fontSize: 6, color: '#cbd5e1' }}>
                    <Text style={getPdfTextStyle(companyName)}>{companyName}</Text> - Sales Order #{order.orderNo}
                </Text>
            </Page>
        </Document>
    );
};
