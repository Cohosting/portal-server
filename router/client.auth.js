const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("../firebase");

const clientAuthRouter = express.Router();

clientAuthRouter.post("/signInWithEmailAndPassword", async (req, res) => {
  const { email, password, portalId } = req.body;

  try {
    const usersRef = db.collection("portalMembers");
    console.log({
      action: "authentication_attempt",
      email,
      portalId,
    });

    const querySnapshot = await usersRef
      .where("email", "==", email)
      .where("portalId", "==", portalId)
      .get();

    if (querySnapshot.empty) {
      console.log({
        action: "authentication_failed",
        reason: "empty_data",
        email,
        portalId,
      });
      return res.status(401).json({
        success: false,
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
        reason: "empty_data",
      });
    } else {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      const hashedPassword = userData.password;

      const isPasswordMatch = await bcrypt.compare(password, hashedPassword);

      if (isPasswordMatch) {
        const token = jwt.sign({ email }, process.env.SECRET_KEY, {
          expiresIn: "1h",
        });
        return res.json({
          success: true,
          message: "User authenticated successfully!",
          token,
        });
      } else {
        console.log({
          action: "authentication_failed",
          reason: "token_validation",
          email,
          portalId,
        });
        return res.status(401).json({
          success: false,
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
          reason: "token_validation",
        });
      }
    }
  } catch (error) {
    console.error({
      action: "authentication_error",
      errorType: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      email,
    });
    return res.status(500).json({
      success: false,
      code: "INTERNAL_ERROR",
      message: "Error authenticating user",
    });
  }
});
const getUserByEmail = async (email, portalId) => {
  try {
    const usersRef = db.collection("portalMembers");
    const querySnapshot = await usersRef
      .where("email", "==", email)
      .where("portalId", "==", portalId)
      .get();

    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      return {
        ...userData,
        // Include additional user data if needed
      };
    }
  } catch (error) {
    console.error("Error retrieving user:", error);
  }

  return null;
};

clientAuthRouter.post("/verifyToken", async (req, res) => {
  try {
    const { token, portalId } = req.body;

    const decoded = jwt.verify(token, process.env.SECRET_KEY);

    // Retrieve user data based on the decoded token, e.g., by querying Firestore
    const user = await getUserByEmail(decoded.email, portalId);

    if (user) {
      res.status(200).json({
        success: true,
        message: "User authenticated successfully!",
        user,
      });
    } else {
      res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }
  } catch (error) {
    console.error("Error verifying token:", error);
    res.status(500).json({
      success: false,
      message: "Error verifying token",
    });
  }
});

module.exports = {
  clientAuthRouter,
};
