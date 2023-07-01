const express = require("express");
const invoiceFinalizedHandler = require("./Handlers/invoiceFinalizedHandler");
const updateInvoiceStatus = require("./Handlers/updateInvoiceStatus");
const { constructEvent } = require("../services/stripeService");
const { errorHandler } = require("../utils");
const connectWebhookHandler = express.Router();
const endpointSecret = "whsec_XPzH5f0bVO8fJSrSKuQkQgvus6WQoP16";

connectWebhookHandler.post(
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
        case "invoice.finalized":
          invoiceFinalizedHandler(event);
          break;
        case "invoice.paid":
          updateInvoiceStatus(event);
          break;
      }
    } catch (error) {
      errorHandler(error, response);
    }
    // Return a 200 response to acknowledge receipt of the event
    response.send();
  }
);

module.exports = connectWebhookHandler;
