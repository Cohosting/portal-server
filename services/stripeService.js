const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY, {
  maxNetworkRetries: 2,
});

module.exports = {
  constructEvent: (payload, sig, endpointSecret) => {
    return stripe.webhooks.constructEvent(payload, sig, endpointSecret);
  },
  stripe,
  // Add other Stripe-related functions here...
};
