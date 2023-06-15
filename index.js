require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
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

const app = express();
app.use(cors());
let removeBrandingPriceId = "price_1N53z2G6ekPTMWCwGfVS7xDn";
let additionalMemberPriceId = "price_1NH7fNG6ekPTMWCwi4CIbCh5";

const endpointSecret =
  "whsec_4ff760b719b6882a9ee21ee8077eb2abd4facc836f96a09c119f5c72ff7123ed";
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    const sig = request.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
    } catch (err) {
      response.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    switch (event.type) {
      case "payment_intent.succeeded":
        const paymentIntent = event.data.object;
        const custId = paymentIntent.customer;
        const paymentMethodId = paymentIntent.payment_method;
        const invoiceId = paymentIntent.invoice;

        // Retrieve the invoice to get the associated subscription ID and metadata
        const inv = await stripe.invoices.retrieve(invoiceId, {
          expand: ["subscription"],
        });

        if (inv && inv.subscription) {
          const subscription = inv.subscription;
          const subscriptionMetadata = subscription.metadata;

          // Check if the payment is for a subscription and has the necessary metadata
          if (
            subscriptionMetadata &&
            subscriptionMetadata.is_subscription === "true" &&
            subscriptionMetadata.subscription_id
          ) {
            // Verify that the subscription is in an active state and matches the customer
            if (
              subscription.status === "active" &&
              subscription.customer === custId
            ) {
              // Check if the customer has a default payment method already set
              const customer = await stripe.customers.retrieve(custId);
              const hasDefaultPaymentMethod =
                !!customer.invoice_settings.default_payment_method;

              if (!hasDefaultPaymentMethod) {
                // Set the payment method as the default for the customer
                await stripe.customers.update(custId, {
                  invoice_settings: {
                    default_payment_method: paymentMethodId,
                  },
                });
              }
            }
          }
        }
        break;
      case "checkout.session.completed":
        const session = event.data.object;

        // Here's where you access the metadata
        const metadata = session.metadata;
        const { subscriptionId, subscriptionStatus, customerId } =
          await getSubscriptionInfo(event);

        await db.collection("portals").doc(metadata.portalId).update({
          subscriptionId,
          subscriptionStatus,
          customerId,
        });

        // Payment is successful and the subscription is created.
        // You should provision the subscription and save the customer ID to your database.
        break;
      case "customer.subscription.updated":
        const updatedSubscription = event.data.object;
        const portalId = updatedSubscription.metadata.portalId; // Assuming you have a metadata field named 'portalId'

        if (updatedSubscription.cancel_at_period_end) {
          // This is a subscription that is set to end (likely a downgrade)
          // Find portal doc in Firebase and update
          let portalRef = db.collection("portals").doc(portalId);
          let updateSingle = await portalRef.update({
            "subscriptions.current.subscriptionEnd":
              updatedSubscription.current_period_end,
          });
        } else if (updatedSubscription.status === "active") {
          // This is an active subscription (likely an upgrade)
          // Find portal doc in Firebase and update
          let portalRef = db.collection("portals").doc(portalId);
          let updateSingle = await portalRef.update({
            subscriptionType: "paid",
            "subscriptions.current.subscriptionId": updatedSubscription.id,
            "subscriptions.current.subscriptionStatus": "active",
            "subscriptions.current.subscriptionEnd":
              updatedSubscription.current_period_end,
            "subscriptions.current.priceId":
              updatedSubscription.items.data[0].price.id,
            "subscriptions.future": admin.firestore.FieldValue.delete(),
          });
        }
        const subscription = event.data.object;
        // console.log the price id of subscribtion
        await db.doc(`portals/${subscription.metadata.portalId}`).update({
          subscriptionStatus: subscription.status,
          subscriptionId: subscription.id,
          isExpiryCount: false,
          priceId: subscription.items.data[0].price.id,
        });

        break;
      case "invoice.paid":
        // Continue to provision the subscription as payments continue to be made.
        // Store the status in your database and check when a user accesses your service.
        // This approach helps you avoid hitting rate limits.

        console.log(event.data.object.lines.data);

        break;
      case "charge.succeeded":
        break;

      case "invoice.payment_failed":
        // The payment failed or the customer does not have a valid payment method.
        // The subscription becomes past_due. Notify your customer and send them to the
        // customer portal to update their payment information.
        break;
      case "invoice.finalized":
        // The payment failed or the customer does not have a valid payment method.
        // The subscription becomes past_due. Notify your customer and send them to the
        // customer portal to update their payment information.
        const invoice = event.data.object;
        // access metadata
        const meta = invoice.metadata;
        if (meta && meta.isFromApp && meta.isFromApp === "true") {
          /* hosted_invoice_url */
        } else {
          const customer = await findUserByCustomerId(invoice.customer);
          if (customer) {
            const portal = await findPortalByURL(customer.portalURL);
            if (portal && portal.settings.autoImport) {
              await importInvoiceToDatabase(invoice, customer);
            } else {
              console.log("Portal not found or auto import is disabled");
            }
          }
        }

        break;
      case "customer.subscription.created":
        const createdSubscription = event.data.object;
        const pid = createdSubscription.metadata.portalId; // Assuming you have a metadata field named 'portalId'

        if (createdSubscription.status === "trialing") {
          // This is the new subscription set to start when the old one ends (likely a downgrade)
          // Find portal doc in Firebase and update
          let portalRef = db.collection("portals").doc(pid);
          portalRef
            .update({
              "subscriptions.future.subscriptionId": createdSubscription.id,
              "subscriptions.future.subscriptionStart":
                createdSubscription.current_period_end,

              "subscriptions.future.priceId":
                createdSubscription.items.data[0].price.id,
            })
            .catch((error) => {
              console.error("Error updating document: ", error);
            });
        }

      default:
      // Unhandled event type
    }

    // Return a 200 response to acknowledge receipt of the event
    response.send();
  }
);

app.use(bodyParser.json());
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

app.post("/create-subscription", async (req, res) => {
  const customerId = req.body.customerId;
  const priceId = req.body.priceId;
  const portalId = req.body.portalId;
  uid = req.body.uid;

  try {
    // Create the subscription. Note we're expanding the Subscription's
    // latest invoice and that invoice's payment_intent
    // so we can pass it to the front end to confirm the payment
    let items = [
      {
        price: priceId,
      },
    ];

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: items,
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        portalId,
        uid,
        is_subscription: "true",
        customer_id: customerId, // Added customer_id in metadata
        first_payment_processed: "false", // Added flag
      },
      billing_cycle_anchor: getNextMonthFirstDayTimestamp(),
      proration_behavior: "create_prorations",
    });
    // Update the subscription to include its own ID in the metadata
    await stripe.subscriptions.update(subscription.id, {
      metadata: {
        ...subscription.metadata,
        subscription_id: subscription.id,
      },
    });

    res.send({
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
    });
  } catch (error) {
    return res.status(400).send({ error: { message: error.message } });
  }
});

app.post("/update-subscription", async (req, res) => {
  const subscriptionId = req.body.subscriptionId; // user's current subscription id
  const newPriceId = req.body.priceId; // new pricing plan id
  const isDowngrade = req.body.isDowngrade; // boolean
  const portalId = req.body.portalId;
  const uid = req.body.uid;

  try {
    if (isDowngrade) {
      // If the user is downgrading, we want to cancel their current subscription
      // at the end of the billing period
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      // Then, schedule a new subscription to start when the old one ends
      const currentSubscription = await stripe.subscriptions.retrieve(
        subscriptionId
      );
      const futureStart = currentSubscription.current_period_end;

      const subscription = await stripe.subscriptions.create({
        customer: currentSubscription.customer,
        items: [{ price: newPriceId }],
        trial_end: futureStart,
        metadata: {
          portalId,
          uid,
        },
      });

      return res.send({
        message: "Subscription updated successfully",
        subscription: subscription,
      });
    }
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Get the id of the item in the subscription we want to modify
    const subscriptionItemId = subscription.items.data[0].id;

    // Update the subscription to use the new price
    const updatedSubscription = await stripe.subscriptions.update(
      subscription.id,
      {
        cancel_at_period_end: false,
        proration_behavior: "create_prorations",
        items: [
          {
            id: subscriptionItemId,
            price: newPriceId,
          },
        ],
      }
    );

    res.send({
      message: "Subscription updated successfully",
      subscription: updatedSubscription,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).send({ error: { message: error.message } });
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

  if (numberOfTeamMembers > 0) {
    items.push({
      price: additionalMemberPriceId,
      quantity: numberOfTeamMembers,
    }); // Replace with your actual Price ID
  }

  // Create the add-on subscription in Stripe
  const addOnSubscription = await stripe.subscriptions.create({
    customer: portalData.customerId,
    items: items,
    metadata: {
      type: "add-on",
      portalId: portalId,
    },
  });

  // Update the portal document in Firestore with the new add-on subscription details
  let updatedItems = {};

  for (let item of addOnSubscription.items.data) {
    if (item.price.id === removeBrandingPriceId) {
      updatedItems["removeBranding"] = { itemId: item.id, active: true };
    } else if (item.price.id === additionalMemberPriceId) {
      updatedItems["additionalTeamMembers"] = {
        itemId: item.id,
        quantity: item.quantity,
      };
    }
  }

  await db.collection("portals").doc(portalId).update({
    "addOnSubscription.subscriptionId": addOnSubscription.id,
    "addOnSubscription.subscriptionStatus": addOnSubscription.status,
    "addOnSubscription.items": updatedItems,
  });

  res.status(200).json({ message: "Add-on subscription created successfully" });
});

app.post("/create-subscription-session", async (req, res) => {
  const { priceId, email, uid, portalId } = req.body;

  const session = await stripe.checkout.sessions.create({
    customer_email: email,
    mode: "subscription",
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],

    success_url: `http://localhost:3000/success`,
    cancel_url: "http://localhost:3000/cancel",
    metadata: {
      portalId: portalId,
      user_id: uid,
      // Add more custom fields here
    },
    subscription_data: {
      trial_settings: {
        end_behavior: {
          missing_payment_method: "cancel",
        },
      },
      trial_period_days: 30,
    },
  });
  res.json({ session });
});

app.use("/connect", connectRouter);






let PORT = 9000

app.listen(PORT, () => {

  console.log(`Server started on port ${PORT}`);
});