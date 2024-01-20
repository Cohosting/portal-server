require('dotenv').config()
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY, {
  maxNetworkRetries: 2,
});
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const connectRouter = require("./router/connect");
const { getSubscriptionInfo } = require("./stripe");
const { findUserByEmail, db, admin } = require("./firebase");
const { formateLineItems } = require("./utils");
const {
  findUserByCustomerId,
  findPortalByURL,
  importInvoiceToDatabase,
  getNextMonthFirstDayTimestamp,
} = require("./utils/index");
const handleSubscriptionCreate = require("./controller/subscription/handleSubscriptionCreate");
const handleSubscriptionUpdate = require("./controller/subscription/handleSubscriptionUpdate");
const webhookHandler = require("./webhook/webhookHandler");
const connectWebhookHandler = require("./webhook/connectWebhookHandler")
const { handleCancelDowngrade } = require('./controller/subscription/handleCancelDowngrade');
const { handleCancelSubscription } = require('./controller/subscription/handleCancelSubscription');
const { handleReactivateSubscription } = require('./controller/subscription/handleReactivateSubscription');

const app = express();
app.use(cors());
let removeBrandingPriceId = "price_1N53z2G6ekPTMWCwGfVS7xDn";
let additionalMemberPriceId = "price_1NH7fNG6ekPTMWCwi4CIbCh5";

app.use("/webhook", webhookHandler);
app.use("/webhook-connect", connectWebhookHandler);
app.use(bodyParser.json());
app.use(cors());

// Create a route for customer creation
app.post("/create-customer", async (req, res) => {
  try {
    // Create a new customer in Stripe
    const customer = await stripe.customers.create({
      email: req.body.email,
      metadata: {
        // include portalId and owner UID
        userId: req.body.userId,
      },
    });

    res.status(200).json({ customerId: customer.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create customer" });
  }
});

app.post("/create-subscription", handleSubscriptionCreate);

app.post("/update-subscription", handleSubscriptionUpdate);
app.post('/cancel-downgrade', handleCancelDowngrade)
app.post("/cancel-subscription", handleCancelSubscription)
app.post("/reactivate-subscription", handleReactivateSubscription)
app.get("/create-billing-portal-session/:customerId", async (req, res) => {
  const customerId = req.params.customerId;
  console.log({ customerId });

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: "https://example.com/account/overview",
      flow_data: {
        type: "payment_method_update",
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Error creating Billing Portal session:", error);
    res
      .status(500)
      .send("An error occurred while creating the Billing Portal session.");
  }
});
app.get("/checkDefaultPaymentMethod/:customerId", async (req, res) => {
  const customerId = req.params.customerId;

  try {
    const customer = await stripe.customers.retrieve(customerId);

    if (
      customer.invoice_settings &&
      customer.invoice_settings.default_payment_method
    ) {
      res.json({ hasDefaultPaymentMethod: true });
    } else {
      res.json({ hasDefaultPaymentMethod: false });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to check default payment method" });
  }
});
app.post("/payment-method", async (req, res) => {
  const { customerId } = req.body;

  try {
    // Retrieve customer data from Stripe
    const customer = await stripe.customers.retrieve(customerId);

    // Get the customer's default payment method
    const defaultPaymentMethodId =
      customer.invoice_settings.default_payment_method;

    // Retrieve payment method data from Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(
      defaultPaymentMethodId
    );

    // Extract the relevant payment method details
    const cardType = paymentMethod.card.brand;
    const last4Digits = paymentMethod.card.last4;

    // Send the payment method data as the API response
    res.json({ cardType, last4Digits });
  } catch (error) {
    console.error(
      "Error retrieving customer or payment method:",
      error.message
    );
    res
      .status(500)
      .json({ error: "Failed to retrieve customer or payment method" });
  }
});

app.post("/team/subscription", async (req, res) => {
  const { totalPaidTeamMember, sId } = req.body;

  console.log({
    totalPaidTeamMember,
    sId,
  });

  try {
    const subscriptionItem = await stripe.subscriptionItems.update(sId, {
      quantity: totalPaidTeamMember,
    });
    res.json({
      data: {
        message: "Subscription quantity updated successfully",
        subscriptionItem,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Error updating the subscription quantity" });
  }
});

app.put("/subscriptions/items", async (req, res) => {
  const { itemId, subscriptionId, portalId } = req.body;

  try {
    // get the subscription object
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    // update the items
    await stripe.subscriptionItems.update(itemId, {
      proration_behavior: "none",
      quantity: 0,
    });

    // update the firebase

    const portalSnapshot = await db.doc(`portals/${portalId}`).get();
    const portalData = portalSnapshot.data();

    // Update the 'removeBranding' property with the 'will_expire' field
    const updatedRemoveBranding = {
      ...portalData.addOnSubscription.items.removeBranding,
      will_expire: subscription.current_period_end,
    };

    // Update the portal document with the modified 'removeBranding' property
    await db.doc(`portals/${portalId}`).update({
      "addOnSubscription.items.removeBranding": updatedRemoveBranding,
    });
    const updated = await stripe.subscriptions.retrieve(subscriptionId);

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
app.post("/createAddOnSubscription", async (req, res) => {
  const { portalId, removeBranding, numberOfTeamMembers } = req.body;

  // Retrieve the portal document from Firestore
  const portalDoc = await db.collection("portals").doc(portalId).get();

  if (!portalDoc.exists) {
    return res.status(404).json({ error: "Portal not found" });
  }

  const portalData = portalDoc.data();

  // Define the items for the new add-on subscription
  let items = [];

  if (removeBranding) {
    items.push({ price: removeBrandingPriceId }); // Replace with your actual Price ID
  }
  const customer = await stripe.customers.retrieve(portalData.customerId);
  const hasDefaultPaymentMethod =
    customer.invoice_settings &&
    customer.invoice_settings.default_payment_method;
  // we can check the subscription status and all the thing than add a new item with ids

  if (
    portalData.addOnSubscription &&
    portalData.addOnSubscription.subscriptionId
  ) {
    const subscription = await stripe.subscriptions.retrieve(
      portalData.addOnSubscription.subscriptionId
    );

    if (subscription.status === "active") {
      const subscriptionItem = await stripe.subscriptionItems.create({
        subscription: subscription.id,
        price: removeBrandingPriceId,
        quantity: 1,
      });
      console.log({ subscriptionItem });
      res.send({
        data: {
          message: "Subscription created successfully",
        },
      });
    } else {
      console.log(
        "Somecription that on file in database seem to be not active! Maybe cancelled or payment issues"
      );
    }

    return;
  }

  try {
    // Create the add-on subscription in Stripe
    if (hasDefaultPaymentMethod) {
      const subs = await stripe.subscriptions.create({
        customer: portalData.customerId,
        items: items,
        payment_settings: {},
        metadata: {
          type: "add-on",
          portalId: portalId,
          is_subscription: "true",
        },
        billing_cycle_anchor: getNextMonthFirstDayTimestamp(),
        proration_behavior: "create_prorations",
      });
      await stripe.subscriptions.update(subs.id, {
        metadata: {
          ...subs.metadata,
          subscription_id: subs.id,
        },
      });

      res.send({
        data: {
          message: "Subscription created successfully",
        },
      });
    } else {
      const addOnSubscription = await stripe.subscriptions.create({
        customer: portalData.customerId,
        items: items,
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
          payment_method_types: ["card"],
        },
        expand: ["latest_invoice.payment_intent"],
        metadata: {
          type: "add-on",
          portalId: portalId,
          is_subscription: "true",
        },
        billing_cycle_anchor: getNextMonthFirstDayTimestamp(),
        proration_behavior: "create_prorations",
      });
      await stripe.subscriptions.update(addOnSubscription.id, {
        metadata: {
          ...addOnSubscription.metadata,
          subscription_id: addOnSubscription.id,
        },
      });

      res.send({
        clientSecret:
          addOnSubscription.latest_invoice.payment_intent.client_secret,
      });
    }
  } catch (err) {
    console.log(err);
  }
});


app.use("/connect", connectRouter);


app.use((err, req, res, next) => {
  console.error(err.stack); // Log error for debugging

  res.status(500).send("Something went wrong!"); // Send a generic error response
});




let PORT = 9000

app.listen(process.env.PORT || PORT, () => {

  console.log(`Server started on port ${PORT}`);
});