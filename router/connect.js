const express = require("express");
const {
  handleCreateConnectAccount,
  handleCreateConnectedCustomer,
  handleGetConnectUser,
  handleCreateOrRetrieveConnectSession,
  handleCreateConnectInvoice,
  handleCreateConnectCheckout,
  handleManageBillingInfo,
} = require("../controller/connect");

const connectRouter = express.Router();

connectRouter.get("/create-connect-account", handleCreateConnectAccount);
connectRouter.post("/create-connected-customer", handleCreateConnectedCustomer);

connectRouter.get("/get-connect-user", handleGetConnectUser);
connectRouter.post(
  "/create-connect-session",
  handleCreateOrRetrieveConnectSession
);
connectRouter.post("/create-connect-invoice", handleCreateConnectInvoice);
connectRouter.post("/create-connect-checkout", handleCreateConnectCheckout);
connectRouter.post("/create-connect-billing-session", handleManageBillingInfo);

module.exports = connectRouter;
