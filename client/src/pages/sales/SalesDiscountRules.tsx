import SalesPricingRules from './SalesPricingRules';

export default function SalesDiscountRules() {
    return (
        <SalesPricingRules
            title="Discount Rules"
            description="Configure discount policies and keep them active/inactive"
            endpoint="discount-rules"
        />
    );
}
