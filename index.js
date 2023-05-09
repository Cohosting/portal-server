require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { getSubscriptionInfo } = require('./stripe');
const { findUserByEmail, db } = require('./firebase');


const app = express();
app.use(cors()); 
const endpointSecret = "whsec_4ff760b719b6882a9ee21ee8077eb2abd4facc836f96a09c119f5c72ff7123ed";
app.post('/webhook', express.raw({type: 'application/json'}), async (request, response) => {
  const sig = request.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    response.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }


  switch (event.type) {
    case 'checkout.session.completed':
    const{
      subscriptionId,
      subscriptionStatus,
      customerId,
      user,
  } = await getSubscriptionInfo(event);

      await db.collection("users").doc(user.uid).update({
        subscriptionId,
        subscriptionStatus,
        customerId
      });

      // Payment is successful and the subscription is created.
      // You should provision the subscription and save the customer ID to your database.
      break;
    case 'invoice.paid':
      // Continue to provision the subscription as payments continue to be made.
      // Store the status in your database and check when a user accesses your service.
      // This approach helps you avoid hitting rate limits.


      break;
    case 'invoice.payment_failed':
      // The payment failed or the customer does not have a valid payment method.
      // The subscription becomes past_due. Notify your customer and send them to the
      // customer portal to update their payment information.
      break;
      case 'account.updated':
        console.log('i  got logged');
        console.log(event.data.object)

        break;
    default:
    // Unhandled event type
  }

  // Return a 200 response to acknowledge receipt of the event
  response.send();
});


app.use(bodyParser.json());
app.post('/create-subscription-session',   async (req, res) => {
const {priceId, email} = req.body;

const session = await stripe.checkout.sessions.create({
  customer_email: email,
  mode: 'subscription',
  line_items: [
    {
      price: priceId,
      quantity: 1,
    },
  ],

  success_url: `http://localhost:3000/success`,
  cancel_url: 'http://localhost:3000/cancel',
});
res.json({ session });
});

const  createConnectAccount = async (userId) => {
  try {
    const account = await stripe.accounts.create({
      type: 'standard',
    });

     await db.collection("users").doc(userId).update({
      stripeConnectAccountId: account.id,
    });
    return account;
  } catch (error) {
    console.error('Error creating account:', error);

  }
}


app.post('/create-connect-account',   async (req, res) => {
  const { userId } = req.body;
    try {
      const account = await  createConnectAccount(userId);
      
      res.json({ account });
    } catch (error) {
      console.error('Error creating account:', error);
  
    }
})

app.post('/create-connect-session',   async (req, res) => {
  const { stripeConnectAccountId, userId } = req.body;

  let id;

  if(!stripeConnectAccountId){
    const account = await  createConnectAccount(userId);
    id = account.id
  } else{
    id = stripeConnectAccountId
  }
  try {
    const accountLink = await stripe.accountLinks.create({
      account:  id,
      refresh_url: 'http://localhost:3000/reauth', // Replace with your refresh URL
      return_url: 'http://localhost:3000/return', // Replace with your return URL
      type: 'account_onboarding',

    });
    res.json({ accountLink });
  } catch (error) {
    console.error('Error creating account link:', error);

  } 

});

app.get('/get-connect-user', async (req, res) => {
  try  {
    const { stripeConnectAccountId } = req.query;
    const account = await stripe.accounts.retrieve(stripeConnectAccountId);
    res.json({ account });
  } catch (error) {
    console.error('Error creating account link:', error);

  }

});



let PORT = 9000

app.listen(PORT, () => {

  console.log(`Server started on port ${PORT}`);
});