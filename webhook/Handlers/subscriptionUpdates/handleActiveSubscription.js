const { admin } = require("../../../firebase");
const { updateFirebaseDocument } = require("./ handleAddOnSubscriptionUpdate");

// Handle Active Subscription
const handleActiveSubscription = async (updatedSubscription, portalId) => {
  await updateFirebaseDocument(portalId, {
    subscriptionType: "paid",
    "subscriptions.current.subscriptionId": updatedSubscription.id,
    "subscriptions.current.subscriptionStatus": "active",
    "subscriptions.current.subscriptionEnd":
      updatedSubscription.current_period_end,
    "subscriptions.current.priceId": updatedSubscription.items.data[0].price.id,
    "subscriptions.future": admin.firestore.FieldValue.delete(),
  });
};

module.exports = { handleActiveSubscription };
