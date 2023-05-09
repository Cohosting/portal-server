const firebase = require("./firebase")
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const getSubscriptionInfo = async (event) => {
    const customer =  await stripe.customers.retrieve(event.data.object.customer);
    const email = customer.email;
    const user = await firebase.findUserByEmail(email);
    const subscription = await stripe.subscriptions.retrieve(event.data.object.subscription);
    const subscriptionId = subscription.id;
    const subscriptionStatus = subscription.status;

    return {
        subscriptionId,
        subscriptionStatus,
        customerId: customer.id,
        user
    }
}

module.exports ={ getSubscriptionInfo}
