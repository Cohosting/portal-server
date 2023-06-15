const formateLineItems = (lineItems) => {
  return lineItems.map((item) => {
    return {
      price_data: {
        currency: "usd",
        unit_amount: item.unit_amount,
        product_data: {
          name: item.description,
        },
      },
      quantity: item.quantity,
    };
  });
};

const formateLineItemsForDB = (lineItems) => {
  return lineItems.map((item) => {
    console.log(item.price, item.price.unit_amount);
    return {
      description: item.description,
      quantity: item.quantity,
      unit_amount: item.amount / item.quantity,
    };
  });
};
module.exports = {
  formateLineItemsForDB,
};

exports.formateLineItems = formateLineItems;
