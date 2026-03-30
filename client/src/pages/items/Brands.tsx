import MasterCRUD from './MasterCRUD';

export default function Brands() {
    return (
        <MasterCRUD
            title="Brands"
            endpoint="/products/meta/brands"
            columns={[{ key: 'name', label: 'Name' }]}
            formFields={[{ name: 'name', label: 'Name', required: true }]}
        />
    );
}
