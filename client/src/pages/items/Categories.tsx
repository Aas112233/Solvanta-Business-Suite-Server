import MasterCRUD from './MasterCRUD';

export default function Categories() {
    return (
        <MasterCRUD
            title="Categories"
            endpoint="/products/meta/categories"
            columns={[{ key: 'name', label: 'Name' }]}
            formFields={[{ name: 'name', label: 'Name', required: true }]}
        />
    );
}
