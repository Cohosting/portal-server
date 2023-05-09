# portal-server

Clone the project and run
npm install
Then start the server "npm run start"


Install stripe CLI 

MacOS: brew install stripe/stripe-cli/stripe

then run: 

stripe login

After Login successfully in your stripe account run this command in another terminal: 
stripe listen --forward-to localhost:9000/webhook
