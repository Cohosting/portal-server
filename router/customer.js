const express = require("express");
const { stripe } = require("../services/stripeService");

const customerRouter = express.Router();
const mode = process.env.APP_MODE;
let url =
  mode === "production"
    ? "https://dashboard.huehq.com"
    : "http://dashboard.localhost:3000";
customerRouter.get("/:customerId/payment-methods", async (req, res) => {
  const customerId = req.params.customerId;

  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
    });

    const customer = await stripe.customers.retrieve(customerId);
    const defaultPaymentMethodId =
      customer.invoice_settings.default_payment_method;
    console.log({ customer });
    const formattedMethods = paymentMethods.data.map((method) => {
      return {
        id: method.id,
        type: method.type,
        last4: method.card?.last4 || method.bank_account?.last4,
        isDefault: method.id === defaultPaymentMethodId,
        // Add isDefault property
        maskedNumber:
          method.card?.brand + " **** **** **** " + method.card?.last4, // Create masked number
        expDate: method.card?.exp_month + "/" + method.card?.exp_year, // Extract expiration date
      };
    });

    res.json(formattedMethods);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to retrieve payment methods" });
  }
});

customerRouter.post("/create-setup-session", async (req, res) => {
  console.log(req.body.customerId);
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "setup",
    ui_mode: "embedded",
    customer: req.body.customerId,
    redirect_on_completion: "never",
    /*     return_url: `${url}/return?session_id={CHECKOUT_SESSION_ID}`,
     */
    metadata: {
      for_failed_payment: "true",
      subscriptionId: req.body.subscriptionId,
      portalId: req.body.portalId,
    },
  });

  res.send({ clientSecret: session.client_secret });
});
customerRouter.post("/create-customer-portal-session", async (req, res) => {
  const session = await stripe.billingPortal.sessions.create({
    customer: req.body.customerId,
    return_url: "https://example.com/account",
  });

  res.json(session);
});
module.exports = customerRouter;

/* 
cs_test_c1dIOhsEGOWGXQsQWl90d7QqtmRa3vagXabUW0jlhGFO9p4h6yfiIw4IhY


*/