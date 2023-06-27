const {
  findUserByCustomerId,
  findPortalByURL,
  importInvoiceToDatabase,
} = require("./../../utils/index");
const invoiceFinalizedHandler = async (event) => {
  try {
    const invoice = event.data.object;
    const meta = invoice.metadata;

    // Strictly ensure isFromApp is not set or is false before proceeding
    if (meta?.isFromApp === "true") {
      console.log("App invoice doesn't need to be imported");
      return;
    }

    const customer = await findUserByCustomerId(invoice.customer);

    // If no customer found, log and stop further execution
    if (!customer) {
      console.log("No customer found for invoice, can't import");
      return;
    }

    const portal = await findPortalByURL(customer.portalURL);

    // If no portal found or autoImport is false, log and stop further execution
    if (!portal || !portal.settings.autoImport) {
      console.log("Portal not found or auto import is disabled");
      return;
    }

    await importInvoiceToDatabase(invoice, customer);
  } catch (error) {
    console.error(`Error in invoiceFinalizedHandler: ${error.message}`);
    // Depending on the error handling policy, you might want to re-throw the error
    throw error;
  }
};

module.exports = invoiceFinalizedHandler;
