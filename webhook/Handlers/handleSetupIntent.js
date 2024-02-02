const { stripe } = require("../../services/stripeService");

const handleSetupIntent = async (sessionObject) => {
  const setupIntent = await stripe.setupIntents.retrieve(
    sessionObject.setup_intent
  );

  await stripe.paymentMethods.attach(setupIntent.payment_method, {
    customer: setupIntent.customer,
  });
};

module.exports = handleSetupIntent;
