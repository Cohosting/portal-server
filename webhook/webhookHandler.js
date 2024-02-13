const express = require("express");
const webhookHandler = express.Router();
const { constructEvent } = require("./../services/stripeService");
const { errorHandler } = require("../utils");
const futureSubscriptionHandling = require("./Handlers/futureSubscriptionHandling");
const failedPaymentHandle = require("./Handlers/failedPaymentHandle");
const updateDefaultPaymentMethod = require("./Handlers/updateDefaultPaymentMethod");
const updateSeatQuantity = require("./Handlers/updateSeatQuantity");
const handleUpdate = require("./Handlers/subscriptionUpdates/handleUpdate");
const handleSetupIntent = require("./Handlers/handleSetupIntent");
const endpointSecret = "whsec_4hNE0BOHmoE76Rnl85BXJoLAGcvp2QnW";

/* main */
/* "whsec_4hNE0BOHmoE76Rnl85BXJoLAGcvp2QnW";
 */
webhookHandler.post(
  "/",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    const sig = request.headers["stripe-signature"];

    let event;

    try {
      event = constructEvent(request.body, sig, endpointSecret);
    } catch (err) {
      return errorHandler(err, response);
    }

    try {
      switch (event.type) {
        case "payment_intent.succeeded":
          updateDefaultPaymentMethod(event);

          break;
        case "invoice.created":
          updateSeatQuantity(event);
          break;

        case "invoice.payment_failed":
          await failedPaymentHandle(event);

          break;
        case "customer.subscription.created":
          const createdSubscription = event.data.object;
          if (createdSubscription.status === "trialing") {
            await futureSubscriptionHandling(createdSubscription);
          }
          break;

        case "customer.subscription.updated":
          handleUpdate(event);
          break;
        case "checkout.session.completed":
          handleSetupIntent(event.data.object);
          break;
      }
    } catch (error) {
      errorHandler(error, response);
    }

    // Return a 200 response to acknowledge receipt of the event
    response.send();
  }
);

module.exports = webhookHandler;
