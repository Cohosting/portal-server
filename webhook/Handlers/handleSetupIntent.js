const { db } = require("../../firebase");
const { stripe } = require("../../services/stripeService");

const handleSetupIntent = async (sessionObject) => {
  const setupIntent = await stripe.setupIntents.retrieve(
    sessionObject.setup_intent
  );
  const metadata = sessionObject.metadata;
  if (metadata.for_failed_payment === "true") {
    const subscription = await stripe.subscriptions.retrieve(
      metadata.subscriptionId
    );

    // Extract the latest invoice ID
    const latestInvoiceId = subscription.latest_invoice;

    const invoice = await stripe.invoices.retrieve(latestInvoiceId);

    // attach the setup intent and set the payment method default on subscription
    const paymentIntent = await stripe.paymentIntents.confirm(
      invoice.payment_intent,
      {
        payment_method: setupIntent.payment_method,
        return_url: "https://www.example.com",
      }
    );
    console.log({ paymentIntent });

    /* Remove error on firebase */
    await db.doc(`portals/${metadata.portalId}`).update({
      payment_error: null,
    });
  } else {
    await stripe.paymentMethods.attach(setupIntent.payment_method, {
      customer: setupIntent.customer,
    });
  }
};

module.exports = handleSetupIntent;
