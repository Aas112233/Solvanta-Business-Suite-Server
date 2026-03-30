import MasterCRUD from './MasterCRUD';

export default function Groups() {
    return (
        <MasterCRUD
            title="Groups"
            endpoint="/products/meta/groups"
            columns={[{ key: 'name', label: 'Name' }]}
            formFields={[{ name: 'name', label: 'Name', required: true }]}
        />
    );
}
