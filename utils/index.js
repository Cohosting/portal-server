const { db } = require("../firebase");
const { formateLineItems, formateLineItemsForDB } = require("../utils");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const createInvoiceItem = async (
  invoiceId,
  customerId,
  amount,
  description,
  quantity,
  stripeConnectAccountId
) => {
  console.log({
    quantity,
    newAm: amount * 100,
  });

  const invoiceItem = await stripe.invoiceItems.create(
    {
      invoice: invoiceId,
      customer: customerId,
      description,
      quantity,
      unit_amount: amount * 100,
    },
    {
      stripeAccount: stripeConnectAccountId,
    }
  );
  return invoiceItem;
};

const findUserByCustomerId = async (customerId) => {
  try {
    const snapshot = await db
      .collection("portalMembers")
      .where("customerId", "==", customerId)
      .limit(1)
      .get();
    const result = snapshot.docs.map((doc) => doc.data())[0];
    if (!result) {
      console.log(`No user found with customerId: ${customerId}`);
    }
    return result;
  } catch (error) {
    console.error(`Error finding user by customerId: ${error.message}`);
    throw error;
  }
};

const findPortalByURL = async (url) => {
  try {
    const snapshot = await db
      .collection("portals")
      .where("portalURL", "==", url)
      .limit(1)
      .get();
    const result = snapshot.docs.map((doc) => doc.data())[0];
    if (!result) {
      console.log(`No portal found with URL: ${url}`);
    }
    return result;
  } catch (error) {
    console.error(`Error finding portal by URL: ${error.message}`);
    throw error;
  }
};
const importInvoiceToDatabase = async (invoice, customer) => {
  const lineItems = formateLineItemsForDB(invoice.lines.data);

  // create invoice to firestore
  let dbRef = db.collection("invoices").doc();
  const invoiceRef = await dbRef.set({
    stripeInvoiceId: invoice.id,
    client: customer,
    attachments: [],
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    customerId: invoice.customer,
    amount: invoice.amount_due,
    status: invoice.status,
    created: invoice.created,
    dueDate: invoice.due_date,
    paid: invoice.paid,
    lineItems,
    id: dbRef.id,
    imported: true,
    portalURL: customer.portalURL,
    hosted_invoice_url: invoice.hosted_invoice_url,
  });
  return invoiceRef;
};
function getNextMonthFirstDayTimestamp() {
  const currentDate = new Date();
  const currentMonth = currentDate.getUTCMonth();

  let nextMonth;
  let nextYear;

  if (currentMonth === 11) {
    nextYear = currentDate.getUTCFullYear() + 1;
    nextMonth = 0; // January (month index 0) of the next year
  } else {
    nextYear = currentDate.getUTCFullYear();
    nextMonth = currentMonth + 1;
  }

  const firstDayOfNextMonth = new Date(Date.UTC(nextYear, nextMonth, 1));
  const offsetMinutes = firstDayOfNextMonth.getTimezoneOffset();
  firstDayOfNextMonth.setUTCMinutes(
    firstDayOfNextMonth.getUTCMinutes() - offsetMinutes
  );

  const unixTimestamp = Math.floor(firstDayOfNextMonth.getTime() / 1000);
  return unixTimestamp;
}
const getPortalData = async (portalId) => {
  try {
    const portalRef = db.collection("portals").doc(portalId);
    const portalDoc = await portalRef.get();

    if (!portalDoc.exists) {
      console.log(`No portal document found with id ${portalId}`);
      return null;
    }

    return portalDoc;
  } catch (error) {
    console.error(`Failed to get portal data for portalId ${portalId}`, error);
    throw error;
  }
};

module.exports = {
  createInvoiceItem,
  findUserByCustomerId,
  findPortalByURL,
  importInvoiceToDatabase,
  getNextMonthFirstDayTimestamp,
  getPortalData,
};
