const { db } = require("../../firebase");

const futureSubscriptionHandling = async (createdSubscription) => {
  const metadata = createdSubscription.metadata;

  // Check if metadata is defined and if it's a future subscription
  if (metadata && metadata.isFutureSubscription === "true") {
    const pid = metadata.portalId;

    // Check if portalId is defined
    if (!pid) {
      console.error("Error: Missing portalId in subscription metadata.");
      return;
    }

    const itemData = createdSubscription.items?.data[0];

    if (!itemData || !itemData.price) {
      throw new Error(
        "Invalid subscription data: price information is missing"
      );
    }

    const portalRef = db.collection("portals").doc(pid);
    await portalRef.update({
      "subscriptions.future.subscriptionId": createdSubscription.id,
      "subscriptions.future.subscriptionStart":
        createdSubscription.current_period_end,
      "subscriptions.future.priceId": itemData.price.id,
    });
  } else {
    console.log("Not a future subscription, skipping update");
  }
};
module.exports = futureSubscriptionHandling;
