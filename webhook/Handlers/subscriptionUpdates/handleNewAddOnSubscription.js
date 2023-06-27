const { stripe } = require("../../../services/stripeService");
const { getNextMonthFirstDayTimestamp } = require("../../../utils/index");

const additionalMemberPriceId = process.env.ADDITIONAL_TEAM_MEMBER_PRICING;
// Create add-on subscription
const handleNewAddOnSubscription = async (customerId, portalId) => {
  return await stripe.subscriptions.create({
    customer: customerId,
    items: [
      {
        price: additionalMemberPriceId,
        quantity: 0,
      },
    ],
    payment_settings: {
      save_default_payment_method: "on_subscription",
    },
    metadata: {
      type: "add-on",
      portalId: portalId,
      is_subscription: "true",
    },
    billing_cycle_anchor: getNextMonthFirstDayTimestamp(),
    proration_behavior: "create_prorations",
  });
};

module.exports = { handleNewAddOnSubscription };
