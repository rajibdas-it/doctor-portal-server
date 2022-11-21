const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

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

function verifyJWT(req, res, next) {
  // console.log("Inside verifyJWT Function", req.headers.authorization);
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, function (error, decoded) {
    if (error) {
      return res.status(403).send({ message: "Forbidden Access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const appointmentOptionsCollection = client
      .db("doctorPortal")
      .collection("appointmentOptions");
    const bookingsCollection = client.db("doctorPortal").collection("bookings");
    const usersCollection = client.db("doctorPortal").collection("users");
    const doctorCollection = client.db("doctorPortal").collection("doctors");

    const verifyAdmin = async (req, res, next) => {
      //console.log(req.decoded.email);
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
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

    app.get("/appointmentSpecialty", async (req, res) => {
      const query = {};
      const result = await appointmentOptionsCollection
        .find(query)
        .project({ name: 1 })
        .toArray();
      res.send(result);
    });

    app.get("/bookings", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      // console.log(email, decodedEmail);
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { paitentEmail: email };
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await bookingsCollection.findOne(query);
      res.send(result);
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

    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "1h",
        });
        return res.send({ accessToken: token });
      }
      return res.status(403).send({ accessToken: "" });
    });

    app.get("/users", async (req, res) => {
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    });

    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.put("/users/admin/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    // app.get("/addPrice", async (req, res) => {
    //   const filter = {};
    //   const options = { upsert: true };
    //   const updateDoc = {
    //     $set: {
    //       price: 99,
    //     },
    //   };
    //   const result = await appointmentOptionsCollection.updateMany(
    //     filter,
    //     updateDoc,
    //     options
    //   );
    //   res.send(result);
    // });

    app.post("/addadoctor", verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });
    app.get("/managedoctor", verifyJWT, verifyAdmin, async (req, res) => {
      const query = {};
      const doctors = await doctorCollection.find(query).toArray();
      res.send(doctors);
    });

    app.delete(
      "/managedoctor/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: ObjectId(id) };
        const result = await doctorCollection.deleteOne(filter);
        res.send(result);
      }
    );
  } finally {
  }
}

run().catch((err) => console.log(err));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
