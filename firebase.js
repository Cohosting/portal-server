let admin = require("firebase-admin");

// Fetch the service account key JSON file contents
let serviceAccount = require("./portal_admin_sdk.json");

// Initialize the app with a custom auth variable, limiting the server's access
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const findUserByEmail = async (email) => {
    const snapshot = await db
        .collection("users")
        .where("email", "==", email)
        .get();
    return snapshot.docs.map((doc) => doc.data())[0];
}
module.exports = {
  findUserByEmail,
  db,
  admin,
};