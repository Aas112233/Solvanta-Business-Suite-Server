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
        marginTop: 2,
    },
    headerRight: {
        alignItems: 'flex-end',
    },
    periodText: {
        marginTop: 4,
        color: '#64748b',
        fontSize: 8,
        fontWeight: 'bold',
    },
    issuedAt: {
        marginTop: 4,
        color: '#94a3b8',
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
        fontSize: 10,
        marginBottom: 2,
    },
    addressLine: {
        fontSize: 8,
        color: '#334155',
        marginTop: 2,
    },

    // Table Section
    table: {
        marginTop: 5,
        marginBottom: 20,
        border: '0.5pt solid #cbd5e1',
        borderRadius: 4,
    },
    tableHeaderRow: {
        flexDirection: 'row',
        backgroundColor: '#f1f5f9',
        borderBottom: '1pt solid #cbd5e1',
        alignItems: 'center',
        paddingVertical: 6,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottom: '0.5pt solid #e2e8f0',
        alignItems: 'center',
        paddingVertical: 5,
    },
    tableRowOpening: {
        flexDirection: 'row',
        backgroundColor: '#f8fafc',
        borderBottom: '0.5pt solid #cbd5e1',
        alignItems: 'center',
        paddingVertical: 6,
    },

    // Columns
    colDate: { width: '12%', paddingLeft: 6 },
    colType: { width: '12%', paddingLeft: 4 },
    colRef: { width: '12%', paddingLeft: 4 },
    colSuppRef: { width: '12%', paddingLeft: 4 },
    colDesc: { width: '20%', paddingLeft: 4, paddingRight: 4 },
    colDebit: { width: '10%', textAlign: 'right', paddingRight: 4 },
    colCredit: { width: '10%', textAlign: 'right', paddingRight: 4 },
    colBalance: { width: '12%', textAlign: 'right', paddingRight: 6 },

    thText: {
        fontSize: 7,
        fontWeight: 'bold',
        color: '#475569',
        textTransform: 'uppercase',
    },
    tdText: {
        fontSize: 7,
        color: '#334155',
    },
    tdBold: {
        fontSize: 7,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    tdMuted: {
        fontSize: 7,
        color: '#94a3b8',
        fontStyle: 'italic',
    },

    // Footer Section
    footerGrid: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 10,
    },
    summaryBox: {
        width: 200,
        backgroundColor: '#f8fafc',
        padding: 10,
        borderRadius: 4,
        border: '0.5pt solid #e2e8f0',
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
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
        marginTop: 6,
        paddingTop: 6,
        borderTop: '1pt solid #cbd5e1',
    },
    netTotalLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    netTotalValue: {
        fontSize: 11,
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

interface SupplierStatementPdfProps {
    supplier: any;
    ledger: any[];
    openingBalance: number;
    finalBalance: number;
    totalDebit: number;
    totalCredit: number;
    startDate: string;
    endDate: string;
    companyName: string;
    currency: string;
}

export const SupplierStatementPdf = ({
    supplier,
    ledger,
    openingBalance,
    finalBalance,
    totalDebit,
    totalCredit,
    startDate,
    endDate,
    companyName,
    currency
}: SupplierStatementPdfProps) => {

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        try {
            return format(new Date(dateString), 'dd/MM/yyyy');
        } catch {
            return dateString;
        }
    };

    const periodLabel = startDate && endDate
        ? `${formatDate(startDate)} to ${formatDate(endDate)}`
        : startDate ? `From ${formatDate(startDate)}`
            : endDate ? `Up to ${formatDate(endDate)}`
                : 'All Time';

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.header} fixed>
                    <View>
                        <Text style={styles.companyName}>{companyName}</Text>
                        <Text style={styles.documentType}>Statement of Account</Text>
                    </View>
                    <View style={styles.headerRight}>
                        <Text style={styles.periodText}>Period: {periodLabel}</Text>
                        <Text style={styles.issuedAt}>
                            Generated on {format(new Date(), 'MMM dd, yyyy HH:mm')}
                        </Text>
                    </View>
                </View>

                <View style={styles.addressGrid} fixed>
                    <View style={styles.addressBox}>
                        <Text style={styles.addressLabel}>Account Information</Text>
                        <View style={{ lineHeight: 1.4 }}>
                            <Text style={styles.addressBold}>{companyName}</Text>
                            <Text style={styles.addressLine}>SOLVANTA ERP System</Text>
                        </View>
                    </View>
                    <View style={styles.addressBox}>
                        <Text style={styles.addressLabel}>Supplier Information</Text>
                        <View style={{ lineHeight: 1.4 }}>
                            <Text style={styles.addressBold}>{supplier?.name || 'Unknown Supplier'}</Text>
                            <Text style={styles.addressLine}>Code: {supplier?.supplierCode || '-'}</Text>
                            {supplier?.vatNumber ? <Text style={styles.addressLine}>VAT Number: {supplier.vatNumber}</Text> : null}
                            {supplier?.phone ? <Text style={styles.addressLine}>Phone: {supplier.phone}</Text> : null}
                            {supplier?.email ? <Text style={styles.addressLine}>Email: {supplier.email}</Text> : null}
                            {supplier?.address?.street ? <Text style={styles.addressLine}>{supplier.address.street}</Text> : null}
                            {supplier?.address?.city ? <Text style={styles.addressLine}>{supplier.address.city}, {supplier.address.country}</Text> : null}
                        </View>
                    </View>
                </View>

                <View style={styles.table}>
                    <View style={styles.tableHeaderRow} fixed>
                        <View style={styles.colDate}><Text style={styles.thText}>Date</Text></View>
                        <View style={styles.colType}><Text style={styles.thText}>Type</Text></View>
                        <View style={styles.colRef}><Text style={styles.thText}>Reference</Text></View>
                        <View style={styles.colSuppRef}><Text style={styles.thText}>Supp. Inv</Text></View>
                        <View style={styles.colDesc}><Text style={styles.thText}>Description</Text></View>
                        <View style={styles.colDebit}><Text style={{ ...styles.thText, textAlign: 'right' }}>Payment (-)</Text></View>
                        <View style={styles.colCredit}><Text style={{ ...styles.thText, textAlign: 'right' }}>Invoice (+)</Text></View>
                        <View style={styles.colBalance}><Text style={{ ...styles.thText, textAlign: 'right' }}>Balance</Text></View>
                    </View>

                    {/* Opening Balance Row */}
                    <View style={styles.tableRowOpening} wrap={false}>
                        <View style={styles.colDate}><Text style={styles.tdText}>{startDate ? formatDate(startDate) : '-'}</Text></View>
                        <View style={styles.colType}><Text style={styles.tdMuted}>--</Text></View>
                        <View style={styles.colRef}><Text style={styles.tdMuted}>--</Text></View>
                        <View style={styles.colSuppRef}><Text style={styles.tdMuted}>--</Text></View>
                        <View style={styles.colDesc}><Text style={[styles.tdText, { fontWeight: 'bold' }]}>Opening Balance</Text></View>
                        <View style={styles.colDebit}><Text style={styles.tdMuted}>-</Text></View>
                        <View style={styles.colCredit}><Text style={styles.tdMuted}>-</Text></View>
                        <View style={styles.colBalance}><Text style={styles.tdBold}>{openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text></View>
                    </View>

                    {/* Transaction Rows */}
                    {ledger.map((row: any, idx: number) => (
                        <View key={idx} style={styles.tableRow} wrap={false}>
                            <View style={styles.colDate}><Text style={styles.tdText}>{formatDate(row.date)}</Text></View>
                            <View style={styles.colType}><Text style={styles.tdText}>{row.type}</Text></View>
                            <View style={styles.colRef}><Text style={styles.tdText}>{row.reference}</Text></View>
                            <View style={styles.colSuppRef}><Text style={styles.tdText}>{row.supplierInvoiceNo || '-'}</Text></View>
                            <View style={styles.colDesc}><Text style={styles.tdText}>{row.description}</Text></View>
                            <View style={styles.colDebit}>
                                <Text style={styles.tdText}>
                                    {row.debit > 0 ? row.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                </Text>
                            </View>
                            <View style={styles.colCredit}>
                                <Text style={styles.tdText}>
                                    {row.credit > 0 ? row.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                </Text>
                            </View>
                            <View style={styles.colBalance}>
                                <Text style={styles.tdBold}>{row.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                            </View>
                        </View>
                    ))}
                </View>

                <View style={styles.footerGrid} wrap={false}>
                    <View style={styles.summaryBox}>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Total Payments</Text>
                            <Text style={styles.summaryValue}>{totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Total Purchases</Text>
                            <Text style={styles.summaryValue}>{totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</Text>
                        </View>
                        <View style={styles.netTotalRow}>
                            <Text style={styles.netTotalLabel}>Ending Balance</Text>
                            <Text style={styles.netTotalValue}>{finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</Text>
                        </View>
                    </View>
                </View>

                <Text style={styles.footerNote} fixed>
                    This is a computer generated statement. For any discrepancies, please contact our accounting department.
                </Text>
            </Page>
        </Document>
    );
};
