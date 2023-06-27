const { stripe } = require("../../services/stripeService");
const { getNextMonthFirstDayTimestamp } = require("../../utils/index");

const SUCCESS_MESSAGE = "Subscription created successfully";

const createSubscription = async (
  customerId,
  items,
  metadata,
  billing_cycle_anchor
) => {
  return await stripe.subscriptions.create({
    customer: customerId,
    items: items,
    metadata: metadata,
    billing_cycle_anchor: billing_cycle_anchor,
    proration_behavior: "create_prorations",
  });
};

const updateSubscription = async (subscriptionId, metadata) => {
  return await stripe.subscriptions.update(subscriptionId, {
    metadata: metadata,
  });
};

const handleSubscriptionCreate = async (req, res) => {
  const { customerId, priceId, portalId, uid } = req.body;
  const items = [{ price: priceId }];
  const billing_cycle_anchor = getNextMonthFirstDayTimestamp();

  let customer;
  try {
    customer = await stripe.customers.retrieve(customerId);
  } catch (error) {
    console.error(`Failed to retrieve customer: ${customerId}`, error);
    return res.status(404).send({ error: { message: "Customer not found" } });
  }

  const hasDefaultPaymentMethod =
    customer.invoice_settings &&
    customer.invoice_settings.default_payment_method;
  const metadata = {
    portalId,
    uid,
    is_subscription: "true",
    customer_id: customerId,
    first_payment_processed: "false",
  };

  let subscription;
  try {
    if (hasDefaultPaymentMethod) {
      subscription = await createSubscription(
        customerId,
        items,
        metadata,
        billing_cycle_anchor
      );
    } else {
      subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: items,
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["latest_invoice.payment_intent"],
        metadata: metadata,
        billing_cycle_anchor: billing_cycle_anchor,
        proration_behavior: "create_prorations",
      });
    }
  } catch (error) {
    console.error(
      `Failed to create subscription for customer: ${customerId}`,
      error
    );
    return res
      .status(500)
      .send({ error: { message: "Failed to create subscription" } });
  }

  try {
    metadata.subscription_id = subscription.id;
    await updateSubscription(subscription.id, metadata);
  } catch (error) {
    console.error(`Failed to update subscription: ${subscription.id}`, error);
    return res
      .status(500)
      .send({ error: { message: "Failed to update subscription" } });
  }

  if (hasDefaultPaymentMethod) {
    res.send({ data: { message: SUCCESS_MESSAGE } });
  } else {
    res.send({
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
    });
  }
};

module.exports = handleSubscriptionCreate;
