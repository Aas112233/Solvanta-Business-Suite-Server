import SalesPricingRules from './SalesPricingRules';

export default function SalesPromotions() {
    return (
        <SalesPricingRules
            title="Promotions"
            description="Create and manage promotional offers used by sales team"
            endpoint="promotions"
        />
    );
}
