const firebase = require("./firebase")
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const getSubscriptionInfo = async (event) => {
    const customer = await stripe.customers.retrieve(
      event.data.object.customer
    );
    const subscription = await stripe.subscriptions.retrieve(event.data.object.subscription);
    const subscriptionId = subscription.id;
    const subscriptionStatus = subscription.status;

    return {
      subscriptionId,
      subscriptionStatus,
      customerId: customer.id,
    };
}

module.exports ={ getSubscriptionInfo}
