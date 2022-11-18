const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Doctor portal server running");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fe8xrlp.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    const appointmentOptionsCollection = client
      .db("doctorPortal")
      .collection("appointmentOptions");
    const bookingsCollection = client.db("doctorPortal").collection("bookings");
    const usersCollection = client.db("doctorPortal").collection("users");

    app.get("/appointmentOptions", async (req, res) => {
      const date = req.query.date;
      const query = {};
      const options = await appointmentOptionsCollection.find(query).toArray();
      const bookingQuery = { appointmentDate: date };
      const alreadyBooked = await bookingsCollection
        .find(bookingQuery)
        .toArray();
      options.forEach((option) => {
        const optionBooked = alreadyBooked.filter(
          (book) => book.treatmentName === option.name
        );
        const bookingSlot = optionBooked.map(
          (book) => book.appointmentShedhule
        );
        const remainingSlots = option.slots.filter(
          (slot) => !bookingSlot.includes(slot)
        );
        option.slots = remainingSlots;
      });
      res.send(options);
    });

    app.get("/bookings", async (req, res) => {
      const email = req.query.email;
      const query = { paitentEmail: email };
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      // console.log(booking);
      const query = {
        appointmentDate: booking.appointmentDate,
        paitentEmail: booking.paitentEmail,
        treatmentName: booking.treatmentName,
      };
      const alreadyBooked = await bookingsCollection.find(query).toArray();
      if (alreadyBooked.length) {
        const message = `You already have a booking on ${booking.appointmentDate}`;
        return res.send({ acknowledge: false, message });
      }
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
  } finally {
  }
}

run().catch((err) => console.log(err));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// const bookingQuery = { appointmentDate: date };
//       const alreadyBooked = await bookingsCollection
//         .find(bookingQuery)
//         .toArray();
//       console.log(alreadyBooked);
//       options.forEach((option) => {
//         const optionBooked = alreadyBooked.filter(
//           (book) => book.treatmentName === option.name
//         );
//         const bookedSlot = optionBooked.map((book) => book.appointmentShedhule);
//         console.log(option.name, bookedSlot);
//       });
