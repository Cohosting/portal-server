const { db, admin } = require("../../firebase");
const { stripe } = require("../../services/stripeService");

const failedPaymentHandle = async (event) => {
  const paymentFailedEvent = event.data.object;

  if (!paymentFailedEvent.subscription) {
    console.log("Invoice not related to a subscription, skipping update");
    return;
  }

  const paymentIt = await stripe.paymentIntents.retrieve(
    paymentFailedEvent.payment_intent
  );
  const error = paymentIt.last_payment_error;
  const subscription = await stripe.subscriptions.retrieve(
    paymentFailedEvent.subscription
  );

  // Check if the subscription has metadata and a related portalId
  const metadata = subscription.metadata;
  if (!metadata || !metadata.portalId) {
    console.error("Subscription metadata or portalId missing, skipping update");
    return;
  }
  let docRef = db.collection("portals").doc(metadata.portalId);
  if (error) {
    delete error.source;
    await docRef
      .update({
        payment_error: {
          subscriptionId: paymentFailedEvent.subscription,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          userId: paymentFailedEvent.customer,
          ...error,
        },
        /*         "subscriptions.current.subscriptionStatus": "active"
         */
      })
      .catch((error) => {
        console.error("Error writing document: ", error);
      });
  } else {
    console.log("No payment error found, skipping update");
  }
};
module.exports = failedPaymentHandle;
