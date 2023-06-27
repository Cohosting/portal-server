const { db } = require("../../firebase");
const { stripe } = require("../../services/stripeService");

const updateSeatQuantity = async (event) => {
  const invoiceId = event.data.object.id;

  if (!invoiceId) {
    throw new Error("Invalid event data: missing invoice id");
  }

  try {
    // Retrieve the draft invoice
    const invoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ["subscription"],
    });

    const { status, subscription } = invoice;
    const { metadata: { portalId } = {} } = subscription || {};

    if (status !== "draft" || !portalId) {
      console.log("Invoice is not draft or Portal Id is missing. Skipping.");
      return;
    }

    // Access the seat collection in Firebase and update it based on portalId
    const seatRef = db.collection("seats").where("portalId", "==", portalId);
    const seatSnapshot = await seatRef.get();
    const seatData = seatSnapshot.docs.map((doc) => doc.data());

    const availableSeats = seatData.filter(
      (seat) => seat.status === "available"
    );
    const seatDeletionPromises = availableSeats.map((seat) =>
      db.doc(`seats/${seat.id}`).delete()
    );

    await Promise.all(seatDeletionPromises);

    const finalSeatQuantity = seatData.length - availableSeats.length;

    // update the subscription item quantity if final quantity - 5 is greater than 0
    if (finalSeatQuantity - 5 >= 0) {
      const subscriptionItemId = subscription.items.data[0].id; // Assuming only one item in the subscription
      await stripe.subscriptionItems.update(subscriptionItemId, {
        quantity: finalSeatQuantity - 5,
      });
    }
  } catch (error) {
    console.error("Error updating seat quantity:", error);
  }
};

module.exports = updateSeatQuantity;
