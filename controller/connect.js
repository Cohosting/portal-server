const { db } = require("../firebase");
const { createInvoiceItem } = require("../utils/index");
const { formateLineItems } = require("./../utils");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const createConnectAccount = async (userId, portalId) => {
  try {
    const account = await stripe.accounts.create({
      type: "standard",
      metadata: {
        userId,
        portalId,
      },
    });

    await db.collection("portals").doc(portalId).update({
      stripeConnectAccountId: account.id,
    });
    return account;
  } catch (error) {
    console.error("Error creating account:", error);
  }
};

const handleCreateConnectAccount = async (req, res) => {
  const { userId } = req.body;
  try {
    const account = await createConnectAccount(userId);

    res.json({ account });
  } catch (error) {
    console.error("Error creating account:", error);
  }
};

const handleCreateConnectedCustomer = async (req, res) => {
  const { email, id, stripeConnectAccountId } = req.body;

  try {
    const customer = await stripe.customers.create(
      {
        email,
      },
      {
        stripeAccount: stripeConnectAccountId,
      }
    );
    // update firebase
    await db.collection("portalMembers").doc(id).update({
      customerId: customer.id,
    });

    res.json({ customer });
  } catch (error) {
    console.error("Error creating customer:", error);
  }
};

const handleGetConnectUser = async (req, res) => {
  try {
    const { stripeConnectAccountId } = req.query;
    const account = await stripe.accounts.retrieve(stripeConnectAccountId);
    res.json({ account });
  } catch (error) {
    console.error("Error creating account link:", error);
  }
};

const mode = process.env.APP_MODE;
let url =
  mode === "production"
    ? "https://dashboard.huehq.com"
    : "http://dashboard.localhost:3000";

// Handles creating or retrieving a Stripe Connect account session
const handleCreateOrRetrieveConnectSession = async (req, res) => {
  const { stripeConnectAccountId, userId, portalId } = req.body;

  let accountId;

  // Check if Stripe Connect Account ID is provided
  if (!stripeConnectAccountId) {
    console.log(
      `Creating new Stripe Connect account for User ID: ${userId}, Portal ID: ${portalId}`
    );
    try {
      const newAccount = await createConnectAccount(userId, portalId);
      accountId = newAccount.id;
    } catch (error) {
      console.error("Error creating Stripe Connect account:", error);
      return res
        .status(500)
        .json({ error: "Failed to create Stripe Connect account" });
    }
  } else {
    accountId = stripeConnectAccountId;
  }
  console.log(`Stripe Connect Account ID: ${accountId}`);

  try {
    // Create account link for onboarding or dashboard access
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.REFRESH_URL}/reauth`, // Use environment variable for refresh URL
      return_url: `${process.env.RETURN_URL}/return`, // Use environment variable for return URL
      type: "account_onboarding",
    });
    res.json({ accountLink });
  } catch (error) {
    console.error("Error creating account link:", error);
    res.status(500).json({ error: "Failed to create account link" });
  }
};

const handleCreateConnectInvoice = async (req, res) => {
  const {
    stripeConnectAccountId,
    line_items,
    customerId,
    payment_settings,
    isFromApp,
    invoiceId,
    memo,
  } = req.body;

  try {
    const invoiceDraft = await stripe.invoices.create(
      {
        description: memo,
        customer: customerId,
        payment_settings,
        metadata: {
          isFromApp,
        },
      },
      {
        stripeAccount: stripeConnectAccountId,
      }
    );

    let promise = [];

    line_items.forEach(async (item) => {
      console.log({ item });
      promise.push(
        createInvoiceItem(
          invoiceDraft.id,
          customerId,
          item.unit_amount,
          item.description,
          Number(item.quantity),
          stripeConnectAccountId
        )
      );
    });

    await Promise.all(promise);
    const invoice = await stripe.invoices.finalizeInvoice(invoiceDraft.id, {
      stripeAccount: stripeConnectAccountId,
    });
    const dbRef = db.doc(`invoices/${invoiceId}`);

    await dbRef.update({
      stripeInvoiceId: invoice.id,
      status: invoice.status,
      hosted_invoice_url: invoice.hosted_invoice_url,
      invoice_pdf: invoice.invoice_pdf,
    });
    res.json({ invoice });
  } catch (error) {
    console.error("Error creating invoice:", error);
  }
};

const handleCreateConnectCheckout = async (req, res) => {
  const { stripeConnectAccountId, line_items, customerId } = req.body;

  const formattedLineItems = formateLineItems(line_items);
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer: customerId,
        payment_method_types: ["us_bank_account"],
        line_items: formattedLineItems,
        success_url: "https://example.com/success",
        cancel_url: "https://example.com/cancel",
      },
      {
        stripeAccount: stripeConnectAccountId,
      }
    );
    res.json({ session });
  } catch (error) {
    console.error("Error creating invoice:", error);
  }
};

const handleManageBillingInfo = async (req, res) => {
  const { customerId, stripeConnectAccountId } = req.body;

  try {
    const session = await stripe.billingPortal.sessions.create(
      {
        customer: customerId,
        return_url: "https://example.com/account",
      },
      {
        stripeAccount: stripeConnectAccountId,
      }
    );
    res.json({ session });
  } catch (error) {
    console.error("Error creating invoice:", error);
  }
};

module.exports = {
  handleCreateConnectAccount,
  handleCreateConnectedCustomer,
  handleGetConnectUser,
  handleCreateOrRetrieveConnectSession,
  handleCreateConnectInvoice,
  handleCreateConnectCheckout,
  handleManageBillingInfo,
};
