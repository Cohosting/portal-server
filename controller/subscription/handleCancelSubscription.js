const { db } = require("../../firebase");
const { stripe } = require("../../services/stripeService");

const handleCancelSubscription = async (req, res) => {
    // cancel in the end of billing period
    const { portalId, subscriptionId, addOnSubscriptionId } = req.body;

    if (!portalId || !subscriptionId || !addOnSubscriptionId) {
        return res.status(400).json({ error: "Invalid request parameters" });
    }

    try {
        const portal = await db.doc(`portals/${portalId}`).get();
        const portalData = portal.data();
        if (!portalData) {
            throw new Error('Portal not found');
        }

    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }

    // Update the cancel at period end to true

    try {
        await stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: true
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });


    }
    // update add-on metadata
    try {
        await stripe.subscriptions.update(addOnSubscriptionId, {
            metadata: {
                teamItemShouldRemoved: "true"
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }

    res.json({ message: 'Subscription updated successfully' });


}

module.exports = { handleCancelSubscription };

