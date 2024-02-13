const { stripe } = require("../../../services/stripeService");
const { getPortalData } = require("../../../utils/index");
const {
  handleAddOnSubscriptionUpdate,
} = require("./ handleAddOnSubscriptionUpdate");
const { handleSubscriptionEnd } = require("./handleSubscriptionEnd");
const { handleActiveSubscription } = require("./handleActiveSubscription");
const { handleNewAddOnSubscription } = require("./handleNewAddOnSubscription");
const listCustomerSubscriptions = async (customerId) => {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
  });

  return subscriptions;
};
const hasExistingAddOn = (subscriptions) => {
  return subscriptions.data.some(
    (subscription) => subscription.metadata.type === "add-on"
  );
};
const handleUpdate = async (event) => {
  const updatedSubscription = event.data.object;
  const portalId = updatedSubscription.metadata.portalId;
  const subscriptionType = updatedSubscription.metadata.type;

  console.log({ statusOfSubs: updatedSubscription.status });
  if (!portalId) {
    console.log("Portal ID is missing");
    return;
  }

  try {
    // Fetch the portal document data
    const portalObject = await getPortalData(portalId);
    const data = portalObject.data();

    // Regular (non-add-on) subscription updated
    if (!subscriptionType || subscriptionType !== "add-on") {
      const existingSubscriptions = await listCustomerSubscriptions(
        data.customerId
      );

      // Handle the case where a subscription has been updated but there's no add-on subscription yet
      console.log("Add-on exist:", hasExistingAddOn(existingSubscriptions));
      if (
        !hasExistingAddOn(existingSubscriptions) &&
        !data.addOnSubscription?.subscriptionId
      ) {
        const newAddOn = await handleNewAddOnSubscription(
          data.customerId,
          portalId
        );
        await handleAddOnSubscriptionUpdate(newAddOn, portalId);
      }
      console.log({
        subscriptionUpdated: updatedSubscription,
        cancel_at_period_end: updatedSubscription.cancel_at_period_end,
      });

      // Process the subscription update based on its status
      if (updatedSubscription.cancel_at_period_end) {
        await handleSubscriptionEnd(updatedSubscription, portalId);
      } else {
        console.log("active sub getting updated");
        await handleActiveSubscription(updatedSubscription, portalId);
      }
    }

    console.log({ subscriptionType });
    // Add-on subscription updated
    if (subscriptionType === "add-on") {
      console.log("add-ons subscription getting updated");
      await handleAddOnSubscriptionUpdate(updatedSubscription, portalId);
    }
  } catch (err) {
    console.log("Error:", err);
  }
};

module.exports = handleUpdate;
