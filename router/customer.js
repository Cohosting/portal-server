const express = require("express");
const { stripe } = require("../services/stripeService");

const customerRouter = express.Router();

customerRouter.get("/:customerId/payment-methods", async (req, res) => {
  const customerId = req.params.customerId;

  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
    });

    const customer = await stripe.customers.retrieve(customerId);
    const defaultPaymentMethodId = customer.default_source;

    const formattedMethods = paymentMethods.data.map((method) => {
      console.log(method.card);
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
    return_url:
      "https://example.com/checkout/return?session_id={CHECKOUT_SESSION_ID}",
  });

  res.send({ clientSecret: session.client_secret });
});

module.exports = customerRouter;
