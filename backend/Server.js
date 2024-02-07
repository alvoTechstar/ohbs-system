// server.js
const express = require("express");
const mysql = require("mysql");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");
const axios = require("axios");
const moment = require("moment");
const fs = require("fs");

const app = express();
const router = express.Router(); // Add this line to create a router object
const port = 3500;
const consumer_key = "eXGfHT6lesLvM8GyrhD2fPfNc4atAmhR";
const consumer_secret = "kU2UEQwqv6UBUkhk";

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

const SECRET_KEY = "your_secret_key"; // Replace this with your own secret key for JWT

app.use(express.json());

const connection = mysql.createConnection({
  host: "localhost",
  port: 3306,
  user: "root",
  password: "",
  database: "ohbs_db",
});

function getRoleFromEmail(email) {
  const username = email.split("@")[0];
  switch (username) {
    case "alvojrseur141":
      return "admin";
    default:
      return "user";
  }
}
connection.connect((err) => {
  if (err) {
    console.error("Error connecting to the database: ", err);
    return;
  }
  console.log("Connected to the database");

  const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id INT(11) PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'user') DEFAULT 'user',
        otp VARCHAR(6),
        otpExpiration DATETIME
      )
    `;

  connection.query(createTableQuery, (error, results) => {
    if (error) {
      console.error("Error creating users table:", error);
      return;
    }
    console.log("Users table created successfully");
  });
  // Create 'contact' table
  const createContactTableQuery = `
CREATE TABLE IF NOT EXISTS contact (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  message TEXT NOT NULL
)
`;

  connection.query(createContactTableQuery, (error) => {
    if (error) {
      console.error("Error creating 'contact' table:", error);
    } else {
      console.log("Created 'contact' table");
    }
  });
  const createPaymentTableQuery = `
  CREATE TABLE IF NOT EXISTS payment_table (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_option VARCHAR(255) NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    mpesa_number VARCHAR(15) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

  connection.query(createPaymentTableQuery, (error) => {
    if (error) {
      console.error("Error creating 'payment_table' table:", error);
    } else {
      console.log("Created 'payment_table' table");
    }
  });
});
// Function to send a welcome email to the user
function sendWelcomeEmail(email) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "alvojrseur141@gmail.com",
      pass: "xynjhxcbxvlktlid",
    },
  });

  // Send the OTP to the user's email
  const mailOptions = {
    from: "alvojrseur141@gmail.com",
    to: email,
    subject: "Welcome to Our Online House Booking System",
    text: "Thank you for registering with us! We're excited to have you on board.",
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending welcome email:", error);
    } else {
      console.log("Welcome email sent:", info.response);
    }
  });
}

app.post("/api/register", (req, res) => {
  const { name, email, password } = req.body;
  const role = getRoleFromEmail(email);

  connection.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    (error, results) => {
      if (error) {
        console.error("Error checking email:", error);
        return res.status(500).json({ error: "Registration failed" });
      }

      if (results.length > 0) {
        return res.status(409).json({ error: "Email is already registered" });
      }

      bcrypt.hash(password, 10, (hashError, hash) => {
        if (hashError) {
          console.error("Error hashing password:", hashError);
          return res.status(500).json({ error: "Registration failed" });
        }

        connection.query(
          "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
          [name, email, hash, role],
          (insertError, insertResults) => {
            if (insertError) {
              console.error("Error inserting user:", insertError);
              return res.status(500).json({ error: "Registration failed" });
            }
            // Send welcome email to the user
            sendWelcomeEmail(email);
            res.status(200).json({ message: "Registration successful" });
          }
        );
      });
    }
  );
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  connection.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (error, results) => {
      if (error) {
        console.error("Error checking email:", error);
        return res.status(500).json({ error: "Login failed" });
      }

      if (results.length === 0) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const { id, name, password: hashedPassword, role } = results[0];
      const passwordMatch = await bcrypt.compare(password, hashedPassword);

      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const authToken = jwt.sign({ id, email, name, role }, SECRET_KEY, {
        expiresIn: "2h",
      });

      res.json({ authToken, roles: [role] });
    }
  );
});

// reset password functionality

app.post("/api/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    connection.query(
      "SELECT * FROM users WHERE email = ?",
      [email],
      async (err, results) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Failed to reset password" });
        }

        const user = results[0];

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const otp = Math.random().toString().slice(-6);
        const otpExpiration = new Date(Date.now() + 10 * 60 * 1000); // OTP valid for 10 minutes

        connection.query(
          "UPDATE users SET otp = ?, otpExpiration = ? WHERE email = ?",
          [otp, otpExpiration, email],
          async (err) => {
            if (err) {
              console.error(err);
              return res
                .status(500)
                .json({ error: "Failed to reset password" });
            }

            // Create the transporter for sending emails
            const transporter = nodemailer.createTransport({
              service: "gmail",
              auth: {
                user: "alvojrseur141@gmail.com",
                pass: "xynjhxcbxvlktlid",
              },
            });

            // Send the OTP to the user's email
            const mailOptions = {
              from: "alvojrseur141@gmail.com",
              to: email,
              subject: "Password Reset OTP",
              text: `Your OTP for password reset is: ${otp}`,
            };

            transporter.sendMail(mailOptions, (error, info) => {
              if (error) {
                console.log("Error sending email:", error);
                return res
                  .status(500)
                  .json({ error: "Failed to reset password" });
              } else {
                console.log("Email sent:", info.response);
              }
            });

            res.json({ message: "OTP sent to your email" });
          }
        );
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

app.post("/api/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Check if the user with the given email exists in the database
    connection.query(
      "SELECT * FROM users WHERE email = ?",
      [email],
      async (err, results) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Failed to verify OTP" });
        }

        const user = results[0];

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        // Check if the OTP is valid and not expired
        if (otp !== user.otp || new Date() > user.otpExpiration) {
          return res.status(400).json({ error: "Invalid OTP" });
        }

        // Delete the OTP from the user's record in the database
        connection.query(
          "UPDATE users SET otp = NULL, otpExpiration = NULL WHERE email = ?",
          [email],
          async (err) => {
            if (err) {
              console.error(err);
              return res.status(500).json({ error: "Failed to verify OTP" });
            }

            res.json({ message: "OTP verified successfully" });
          }
        );
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to verify OTP" });
  }
});

// Endpoint to update user's password
app.post("/api/update-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    // Hash the new password before saving it in the database
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the password in the database for the user with the given email
    connection.query(
      "UPDATE users SET password = ? WHERE email = ?",
      [hashedPassword, email],
      async (err) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Failed to update password" });
        }

        res.json({ message: "Password successfully updated" });
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update password" });
  }
});
app.use(bodyParser.json());

// Define a route for user contact messages
app.post("/api/contact", (req, res) => {
  const { name, email, message } = req.body;

  // Insert the user's contact message into the 'contacts' table
  db.query(
    "INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)",
    [name, email, message],
    (err) => {
      if (err) {
        console.error('Error inserting data into the "contacts" table:', err);
        res.status(500).json({ message: "Contact message submission failed" });
      } else {
        console.log("Contact message submitted successfully");

        // Send a thank-you email to the user
        sendThankYouEmail(name, email);

        res.status(200).json({
          message: "Contact message submitted successfully",
        });
      }
    }
  );
});

// Send a thank-you email to the user
const sendThankYouEmail = (name, email) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "your_gmail_account@gmail.com",
      pass: "your_gmail_password",
    },
  });

  const mailOptions = {
    from: "your_gmail_account@gmail.com",
    to: email,
    subject: "Thank You for Contacting OHBS",
    text: `Hello ${name},\n\nThank you for contacting OHBS. We have received your message and will respond shortly.\n\nBest regards, TMUCU`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending thank-you email:", error);
    } else {
      console.log("Thank-you email sent:", info.response);
    }
  });
};

// ACCESS TOKEN FUNCTION - Updated to use 'axios'
async function getAccessToken() {
  const consumer_key = "DcwzWBbqmZJ7IaksGVsq74q0pqYtFYGXqlxwaj6GD2MtU1sX"; // REPLACE IT WITH YOUR CONSUMER KEY
  const consumer_secret =
    "U2jQdDmvWEhZvJH1pK12OnZTnlCJcMJWHMrfZkLmC4gBxVGra07IhCSO3vYJYwRh"; // REPLACE IT WITH YOUR CONSUMER SECRET
  const url =
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
  const auth =
    "Basic " +
    new Buffer.from(consumer_key + ":" + consumer_secret).toString("base64");

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: auth,
      },
    });

    const dataresponse = response.data;
    // console.log(data);
    const accessToken = dataresponse.access_token;
    return accessToken;
  } catch (error) {
    throw error;
  }
}

app.get("/", (req, res) => {
  res.send("MPESA DARAJA API WITH NODE JS BY UMESKIA SOFTWARES");
  var timeStamp = moment().format("YYYYMMDDHHmmss");
  console.log(timeStamp);
});

//ACCESS TOKEN ROUTE
app.get("/access_token", (req, res) => {
  getAccessToken()
    .then((accessToken) => {
      res.send("😀 Your access token is " + accessToken);
    })
    .catch(console.log);
});
app.get("/stkpush", (req, res) => {
  const { totalPayable, mpesaNumber } = req.query; // Retrieve total payable amount and mpesa number from query parameters

  getAccessToken()
    .then((accessToken) => {
      const url =
        "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
      const auth = "Bearer " + accessToken;
      const timestamp = moment().format("YYYYMMDDHHmmss");
      const password = new Buffer.from(
        "174379" +
          "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919" +
          timestamp
      ).toString("base64");

      axios
        .post(
          url,
          {
            BusinessShortCode: "174379",
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: totalPayable, // Use totalPayable from query parameter
            PartyA: mpesaNumber, // Use mpesaNumber from query parameter
            PartyB: "174379",
            PhoneNumber: mpesaNumber,
            CallBackURL: "https://dd3d-105-160-22-207.ngrok-free.app/callback",
            AccountReference: "ALVO TECH PAY",
            TransactionDesc: "Mpesa Daraja API stk push test",
          },
          {
            headers: {
              Authorization: auth,
            },
          }
        )
        .then((response) => {
          // Store payment information in the payment_table
          const paymentData = {
            payment_option: "Mpesa STK Push",
            first_name: req.body.firstName, // Assuming you receive this data from the frontend
            last_name: req.body.lastName, // Assuming you receive this data from the frontend
            email: req.body.email, // Assuming you receive this data from the frontend
            mpesa_number: mpesaNumber,
            amount: totalPayable,
          };

          connection.query(
            "INSERT INTO payment_table SET ?",
            paymentData,
            (paymentError, paymentResults) => {
              if (paymentError) {
                console.error("Error inserting payment data:", paymentError);
                return res.status(500).send("❌ Payment failed");
              }
              console.log("Payment data inserted successfully");

              // Send a response to the frontend
              res.send(
                "😀 Request is successful done ✔✔. Please enter M-Pesa pin to complete the transaction"
              );
            }
          );
        })
        .catch((error) => {
          console.log(error);
          res.status(500).send("❌ Request failed");
        });
    })
    .catch(console.log);
});

//STK PUSH CALLBACK ROUTE
app.post("/callback", (req, res) => {
  console.log("STK PUSH CALLBACK");
  const CheckoutRequestID = req.body.Body.stkCallback.CheckoutRequestID;
  const ResultCode = req.body.Body.stkCallback.ResultCode;
  var json = JSON.stringify(req.body);
  fs.writeFile("stkcallback.json", json, "utf8", function (err) {
    if (err) {
      return console.log(err);
    }
    console.log("STK PUSH CALLBACK JSON FILE SAVED");
  });
  console.log(req.body);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
