const { db } = require("../../../firebase");
const { stripe } = require("../../../services/stripeService");

const additionalMemberPriceId = process.env.ADDITIONAL_TEAM_MEMBER_PRICING;
const removeBrandingPriceId = process.env.REMOVE_BRANDING_PRICE;
// Handle Add-On Subscription
const updateFirebaseDocument = async (portalId, updateData) => {
  await db.collection("portals").doc(portalId).update(updateData);
};

const handleAddOnSubscriptionUpdate = async (addOnSubscription, portalId) => {
  let updatedItems = {};

  console.log({
    additionalMemberPriceId,
    removeBrandingPriceId,
  });
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
  console.log("Updating....", updatedItems);

  await updateFirebaseDocument(portalId, {
    "addOnSubscription.subscriptionId": addOnSubscription.id,
    "addOnSubscription.subscriptionStatus": addOnSubscription.status,
    "addOnSubscription.items": updatedItems,
  });
};

module.exports = {
  handleAddOnSubscriptionUpdate,
  updateFirebaseDocument,
};
