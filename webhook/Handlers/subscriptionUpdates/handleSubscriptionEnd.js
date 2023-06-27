const { updateFirebaseDocument } = require("./ handleAddOnSubscriptionUpdate");

const handleSubscriptionEnd = async (updatedSubscription, portalId) => {
  await updateFirebaseDocument(portalId, {
    "subscriptions.current.subscriptionEnd":
      updatedSubscription.current_period_end,
  });
};

module.exports = {
  handleSubscriptionEnd,
};
