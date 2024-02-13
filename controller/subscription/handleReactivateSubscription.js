const { db } = require("../../firebase");
const { stripe } = require("../../services/stripeService");

const handleReactivateSubscription = async (req, res) => {

    console.log('getting invoked')
    const { subscriptionId, portalId, addOnSubscriptionId } = req.body;

    if (!subscriptionId || !portalId || !addOnSubscriptionId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const ref = await db.doc(`portals/${portalId}`).get();
        const portalData = ref.data();
        if (!portalData) {
            return res.status(404).json({ error: "Portal not found" });
        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
    }


    try {

        await stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: false,
        });

    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
    }

    try {
        stripe.subscriptions.update(addOnSubscriptionId, {
            teamItemShouldRemoved: "true"
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
    }

    return res.status(200).json({ message: "Subscription reactivated successfully" });
};

module.exports = { handleReactivateSubscription };