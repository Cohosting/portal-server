const { db } = require("../../firebase");

const updateInvoiceStatus = async (event) => {
  const stripeInvoiceId = event.data.object.id;

  try {
    const invoicesRef = db.collection("invoices");
    const query = invoicesRef.where("stripeInvoiceId", "==", stripeInvoiceId);
    const querySnapshot = await query.get();

    if (querySnapshot.empty) {
      throw new Error(`Invoice ${stripeInvoiceId} not found.`);
    }

    const invoiceDoc = querySnapshot.docs[0];
    const invoiceData = invoiceDoc.data();

    if (!invoiceData.portalId) {
      console.log("This invoice is not related to any portal");
    }

    const portalRef = db.collection("portals").doc(invoiceData.portalId);
    const portalSnapshot = await portalRef.get();

    if (!portalSnapshot.exists) {
      console.log(`Portal ${invoiceData.portalId} not found.`);
    }

    await invoiceDoc.ref.update({ status: "paid" });
    console.log(`Invoice ${stripeInvoiceId} status updated to 'paid'.`);
  } catch (error) {
    console.error("Error updating invoice status:", error);
  }
};

module.exports = updateInvoiceStatus;
