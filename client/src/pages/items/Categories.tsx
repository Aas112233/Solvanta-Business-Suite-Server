import MasterCRUD from './MasterCRUD';

export default function Categories() {
    return (
        <MasterCRUD
            title="Categories"
            endpoint="/products/meta/categories"
            columns={[
                { key: 'name', label: 'Name' },
                {
                    key: 'defaultProfitMarginPct',
                    label: 'Default Profit %',
                    render: (row: any) => `${Number(row.defaultProfitMarginPct || 0).toFixed(2)}%`,
                },
            ]}
            formFields={[
                { name: 'name', label: 'Name', required: true },
                { name: 'defaultProfitMarginPct', label: 'Default Profit %', type: 'number', defaultValue: 0 },
            ]}
        />
    );
}
