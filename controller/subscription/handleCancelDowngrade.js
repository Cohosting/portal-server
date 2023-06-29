const { db } = require("../../firebase");
const { stripe } = require("../../services/stripeService");

const handleCancelDowngrade = async (req, res) => {
    const { portalId, currentSubscriptionId, futureSubscriptionId, addOnSubscriptionId } = req.body;

    if (!portalId || !currentSubscriptionId || !futureSubscriptionId || !addOnSubscriptionId) {
        return res.status(400).json({ error: "Invalid request parameters" });
    }

    try {
        const portal = await db.doc(`portals/${portalId}`).get();
        const portalData = portal.data();
        if (!portalData) {
            throw new Error('Portal not found');
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }

    // Update the cancel at period end to false
    try {
        await stripe.subscriptions.update(currentSubscriptionId, {
            cancel_at_period_end: false
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
    // update add-on metadata


    try {
        await stripe.subscriptions.update(addOnSubscriptionId, {
            metadata: {
                teamItemShouldRemoved: "false"
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }

    // delete the future subscription
    try {
        await stripe.subscriptions.del(futureSubscriptionId);
    } catch (err) {
        console.log(err);

        res.status(500).json({ error: "Internal Server Error" });
    };

    res.json({ message: 'Subscription updated successfully' });



}

module.exports = {
    handleCancelDowngrade
}