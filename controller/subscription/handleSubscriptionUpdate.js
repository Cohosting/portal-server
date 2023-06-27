const { stripe } = require("../../services/stripeService");

const handleSubscriptionUpdate = async (req, res) => {
  const {
    subscriptionId,
    priceId: newPriceId,
    isDowngrade,
    portalId,
    uid,
  } = req.body;

  // validate request body
  if (!subscriptionId || !newPriceId || isDowngrade === undefined) {
    return res.status(400).json({ error: "Invalid request parameters" });
  }

  try {
    let subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      console.error(
        `Failed to retrieve subscription: ${subscriptionId}`,
        error
      );
      return res
        .status(404)
        .send({ error: { message: "Subscription not found" } });
    }

    const subscriptionItemId = subscription.items.data[0].id;

    if (isDowngrade) {
      const futureStart = subscription.current_period_end;
      let newSubscription;
      try {
        newSubscription = await stripe.subscriptions.create({
          customer: subscription.customer,
          items: [{ price: newPriceId }],
          trial_end: futureStart,
          metadata: { portalId, uid },
        });
      } catch (error) {
        console.error(
          `Failed to create new subscription for downgrade: ${subscriptionId}`,
          error
        );
        return res
          .status(500)
          .send({ error: { message: "Failed to create new subscription" } });
      }

      try {
        await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
      } catch (error) {
        console.error(
          `Failed to cancel old subscription after downgrade: ${subscriptionId}`,
          error
        );
        return res
          .status(500)
          .send({ error: { message: "Failed to cancel old subscription" } });
      }

      res.send({
        message: "Subscription updated successfully(Downgrade)",
        subscription: newSubscription,
      });
    } else {
      let updatedSubscription;
      try {
        updatedSubscription = await stripe.subscriptions.update(
          subscription.id,
          {
            cancel_at_period_end: false,
            proration_behavior: "create_prorations",
            items: [{ id: subscriptionItemId, price: newPriceId }],
          }
        );
      } catch (error) {
        console.error(
          `Failed to update subscription for upgrade: ${subscriptionId}`,
          error
        );
        return res
          .status(500)
          .send({ error: { message: "Failed to update subscription" } });
      }

      res.send({
        message: "Subscription updated successfully(Upgrade)",
        subscription: updatedSubscription,
      });
    }
  } catch (error) {
    console.error(`Failed to update subscription: ${subscriptionId}`, error);
    return res
      .status(500)
      .send({ error: { message: "Failed to update subscription" } });
  }
};

module.exports = handleSubscriptionUpdate;
