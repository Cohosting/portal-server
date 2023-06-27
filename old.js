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
      case "invoice.created":
        const subInv = event.data.object.id;

        try {
          // Retrieve the draft invoice
          const invoice = await stripe.invoices.retrieve(subInv, {
            expand: ["subscription"],
          });

          // Check if the invoice is in the draft state
          if (
            invoice.status === "draft" &&
            invoice.subscription &&
            invoice.subscription.metadata &&
            invoice.subscription.metadata.portalId
          ) {
            const subscription = invoice.subscription;
            const portalId = subscription.metadata.portalId;
            console.log({
              metadata: subscription.metadata,
            });

            // Access the seat collection in Firebase and update it based on portalId
            const seatRef = db
              .collection("seats")
              .where("portalId", "==", portalId);
            const seatSnapshot = await seatRef.get();
            const data = seatSnapshot.docs.map((el) => el.data());

            const availableSeat = data.filter(
              (el) => el.status === "available"
            );
            console.log(availableSeat);
            let pending = [];
            // Remove the available seat
            availableSeat.forEach((el) => {
              console.log(`IDs:`, el.id);
              const ref = db.doc(`seats/${el.id}`).delete();
              pending.push(ref);
            });

            const promiseFullfiling = await Promise.all(pending);
            // Update the quantity
            let finalQuantity = data.length - availableSeat.length;
            console.log({
              totalSeat: data.length,
              finalQuantity,
              totalShouldCharge: finalQuantity - 5,
            });

            // update the subscription
            // Update the subscription item quantity
            if (finalQuantity - 5 > 0) {
              setTimeout(async () => {
                const subscriptionItemId = subscription.items.data[0].id; // Assuming only one item in the subscription
                await stripe.subscriptionItems.update(subscriptionItemId, {
                  quantity: finalQuantity - 5,
                });
              }, 30000);
            }
          }
        } catch (error) {
          console.error("Error updating invoice:", error);
        }

        break;
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

      case "customer.subscription.updated":
        const updatedSubscription = event.data.object;
        const portalId = updatedSubscription.metadata.portalId; // Assuming you have a metadata field named 'portalId'
        const subscriptionType = updatedSubscription.metadata.type; // Assuming you have a metadata field named 'type'

        try {
          if (portalId && !(subscriptionType === "add-on")) {
            const portalObject = await db.doc(`portals/${portalId}`).get();
            const data = portalObject.data();

            // Fetch existing subscriptions for the customer
            const existingSubscriptions = await stripe.subscriptions.list({
              customer: data.customerId,
            });

            // Check if an add-on subscription already exists
            const hasExistingAddOn = existingSubscriptions.data.some(
              (subscription) => subscription.metadata.type === "add-on"
            );

            // If there's no add-on subscription, create a new one
            if (
              !hasExistingAddOn &&
              (!data.addOnSubscription ||
                !data.addOnSubscription.subscriptionId)
            ) {
              const subs = await stripe.subscriptions.create({
                customer: data.customerId,
                items: [
                  {
                    price: additionalMemberPriceId,
                    quantity: 0,
                  },
                ],
                payment_settings: {
                  save_default_payment_method: "on_subscription",
                },
                metadata: {
                  type: "add-on",
                  portalId: portalId,
                  is_subscription: "true",
                },
                billing_cycle_anchor: getNextMonthFirstDayTimestamp(),
                proration_behavior: "create_prorations",
              });

              let ob = {};
              for (let item of subs.items.data) {
                if (item.price.id === removeBrandingPriceId) {
                  ob["removeBranding"] = {
                    itemId: item.id,
                    active: true,
                  };
                } else if (item.price.id === additionalMemberPriceId) {
                  ob["additionalTeamMembers"] = {
                    itemId: item.id,
                    quantity: item.quantity,
                  };
                }
              }

              await db.collection("portals").doc(portalId).update({
                "addOnSubscription.subscriptionId": subs.id,
                "addOnSubscription.subscriptionStatus": subs.status,
                "addOnSubscription.items": ob,
              });
            }
          }
          if (subscriptionType === "add-on") {
            const addOnSubscription = updatedSubscription;
            const portalObject = await db.doc(`portals/${portalId}`).get();

            let updatedItems = {};

            for (let item of addOnSubscription.items.data) {
              if (item.price.id === removeBrandingPriceId) {
                updatedItems["removeBranding"] = {
                  itemId: item.id,
                  active: true,
                };
              } else if (item.price.id === additionalMemberPriceId) {
                updatedItems["additionalTeamMembers"] = {
                  itemId: item.id,
                  quantity: item.quantity,
                };
              }
            }

            if (!updatedItems.additionalTeamMembers) {
              // create the item and update it
              const subscriptionItem = await stripe.subscriptionItems.create({
                subscription: addOnSubscription.id,
                price: additionalMemberPriceId,
                quantity: 0,
              });
              updatedItems["additionalTeamMembers"] = {
                itemId: subscriptionItem.id,
                quantity: subscriptionItem.quantity,
              };
            }

            await db.collection("portals").doc(portalId).update({
              "addOnSubscription.subscriptionId": addOnSubscription.id,
              "addOnSubscription.subscriptionStatus": addOnSubscription.status,
              "addOnSubscription.items": updatedItems,
            });
          } else {
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
          }
        } catch (err) {
          console.log("Error:", err);
        }

        /*         const subscription = event.data.object;
          // console.log the price id of subscribtion
          await db.doc(`portals/${subscription.metadata.portalId}`).update({
            subscriptionStatus: subscription.status,
            subscriptionId: subscription.id,
            isExpiryCount: false,
            priceId: subscription.items.data[0].price.id,
          }); */

        break;
      case "invoice.paid":
        // Continue to provision the subscription as payments continue to be made.
        // Store the status in your database and check when a user accesses your service.
        // This approach helps you avoid hitting rate limits.

        const iid = event.data.object.id;

        try {
          // Find the invoice in the Firestore database using a query
          const invoicesRef = db.collection("invoices");
          const query = invoicesRef.where("stripeInvoiceId", "==", iid);
          const querySnapshot = await query.get();

          if (!querySnapshot.empty) {
            // Update the first matching invoice's status to 'paid'
            const invoiceDoc = querySnapshot.docs[0];
            await invoiceDoc.ref.update({ status: "paid" });
          } else {
            console.log(`Invoice ${iid} not found.`);
          }
        } catch (error) {
          console.error("Error updating invoice:", error);
        }

        break;
      case "charge.succeeded":
        break;

      case "invoice.payment_failed":
        // This for subscription not for connect
        const paymentFailedEvent = event.data.object;
        const mta = paymentFailedEvent.metadata;
        if (!paymentFailedEvent.subscription || mta.portalId) return;
        const paymentIt = await stripe.paymentIntents.retrieve(
          paymentFailedEvent.payment_intent
        );
        const error =
          paymentIt.last_payment_error && paymentIt.last_payment_error;
        const subscription = await stripe.subscriptions.retrieve(
          paymentFailedEvent.subscription
        );

        const pId = subscription.metadata.portalId;
        let docRef = db.collection("portals").doc(pId);
        if (error) {
          delete error.source;

          let updateData = docRef
            .update({
              payment_error: {
                subscriptionId: paymentFailedEvent.subscription, // Subscription ID
                timestamp: admin.firestore.FieldValue.serverTimestamp(), // Current timestamp
                userId: paymentFailedEvent.customer, // User ID
                ...error,
              },
            })
            .catch((error) => {
              console.error("Error writing document: ", error);
            });
        }

        break;

      case "customer.subscription.created":
        const createdSubscription = event.data.object;
        const pid = createdSubscription.metadata.portalId;
        if (createdSubscription.status === "trialing") {
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
        break;

      default:
      // Unhandled event type
    }

    // Return a 200 response to acknowledge receipt of the event
    response.send();
  }
);
