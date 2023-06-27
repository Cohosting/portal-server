const { stripe } = require("../../services/stripeService");

const updateDefaultPaymentMethod = async (event) => {
  if (
    !event.data.object.hasOwnProperty("customer") ||
    !event.data.object.hasOwnProperty("payment_method") ||
    !event.data.object.hasOwnProperty("invoice")
  ) {
    throw new Error("Invalid event data: missing required fields");
  }

  const {
    customer: customerId,
    payment_method: paymentMethodId,
    invoice: invoiceId,
  } = event.data.object;
  try {
    const invoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ["subscription"],
    });

    if (!invoice.subscription) {
      throw new Error(`No subscription associated with invoice ${invoiceId}`);
    }

    const {
      metadata,
      status,
      customer: subscriptionCustomer,
    } = invoice.subscription;

    if (
      !metadata ||
      metadata.is_subscription !== "true" ||
      !metadata.subscription_id
    ) {
      console.log(
        `Invoice ${invoiceId} is not related to a subscription. Skipping.`
      );
      return;
    }

    if (status !== "active" || subscriptionCustomer !== customerId) {
      console.log(
        `Subscription not active or does not match the customer. Skipping.`
      );
      return;
    }

    const customer = await stripe.customers.retrieve(customerId);
    const hasDefaultPaymentMethod =
      !!customer.invoice_settings.default_payment_method;

    if (!hasDefaultPaymentMethod) {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }
  } catch (error) {
    console.error("Error updating default payment method:", error);
  }
};

module.exports = updateDefaultPaymentMethod;
