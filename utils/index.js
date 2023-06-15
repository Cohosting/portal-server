const { db } = require("../firebase");
const { formateLineItems, formateLineItemsForDB } = require("../utils");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const createInvoiceItem = async (
  invoiceId,
  customerId,
  amount,
  description,
  stripeConnectAccountId
) => {
  const invoiceItem = await stripe.invoiceItems.create(
    {
      invoice: invoiceId,
      customer: customerId,
      amount,
      currency: "usd",
      description,
    },
    {
      stripeAccount: stripeConnectAccountId,
    }
  );
  return invoiceItem;
};

const findUserByCustomerId = async (customerId) => {
  const snapshot = await db
    .collection("portalMembers")
    .where("customerId", "==", customerId)
    .get();
  return snapshot.docs.map((doc) => doc.data())[0];
};
const findPortalByURL = async (url) => {
  const snapshot = await db
    .collection("portals")
    .where("portalURL", "==", url)
    .get();
  return snapshot.docs.map((doc) => doc.data())[0];
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

module.exports = {
  createInvoiceItem,
  findUserByCustomerId,
  findPortalByURL,
  importInvoiceToDatabase,
  getNextMonthFirstDayTimestamp,
};
