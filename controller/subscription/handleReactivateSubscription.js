const { db } = require("../../firebase");
const { stripe } = require("../../services/stripeService");
const handleReactivateSubscription = async (req, res) => {
  console.log("handleReactivateSubscription invoked");

  const { subscriptionId, portalId, addOnSubscriptionId } = req.body;

  if (!subscriptionId || !portalId || !addOnSubscriptionId) {
    console.error(
      "Missing required fields:",
      subscriptionId,
      portalId,
      addOnSubscriptionId
    );
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    console.log("Fetching portal data for:", portalId);
    const ref = await db.doc(`portals/${portalId}`).get();
    const portalData = ref.data();
    if (!portalData) {
      console.error("Portal not found:", portalId);
      return res.status(404).json({ error: "Portal not found" });
    }
  } catch (error) {
    console.error("Error fetching portal data:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }

  try {
    console.log("Updating main subscription:", subscriptionId);
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
  } catch (error) {
    console.error("Error updating main subscription:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }

  try {
    console.log("Updating add-on subscription:", addOnSubscriptionId);
    await stripe.subscriptions.update(addOnSubscriptionId, {
      teamItemShouldRemoved: "true",
    });
  } catch (error) {
    console.error("Error updating add-on subscription:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }

  console.log("Subscription reactivated successfully");
  return res
    .status(200)
    .json({ message: "Subscription reactivated successfully" });
};
  

module.exports = { handleReactivateSubscription };