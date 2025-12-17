const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");



dotenv.config();
const app = express();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ylskxp9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        const db = client.db("SmartDine");
        const usersCollection = db.collection("users");
        const menuCollections = db.collection("menus");
        const ordersCollection = db.collection("orders");

        app.get("/", (req, res) => {
            res.send(" Smart Dine server is running perfectly!");
        });

        // All Users
        app.get("/users", async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        });

        app.get("/users/:email", async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email });
            res.send(user);
        });

        // Post User
        app.post("/users", async (req, res) => {
            const user = req.body;
            const exist = await usersCollection.findOne({ email: user.email });
            if (exist) return res.send({ msg: "User already exists" });
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // All Menus
        app.get("/menus", async (req, res) => {
            const menus = await menuCollections.find().toArray();
            res.send(menus);
        });

        // Post Menu
        app.post("/menus", async (req, res) => {
            const menu = req.body;
            if (!menu.name || !menu.image) {
                return res.status(400).send({ message: "Name and image are required" });
            }
            const result = await menuCollections.insertOne(menu);
            res.send(result);
        });

        // Update Menu
        app.put("/menus/:id", async (req, res) => {
            const id = req.params.id;
            const updateData = req.body;
            const result = await menuCollections.updateOne(
                { _id: new ObjectId(id) },
                { $set: updateData }
            );
            res.send(result);
        });

        // Update Users (Role)
        app.patch("/users/role/:id", async (req, res) => {
            const id = req.params.id;
            const { role } = req.body;
            if (!role) return res.status(400).send({ message: "Role required" });

            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { role } }
            );
            res.send(result);
        });



        // Delete Menu
        app.delete("/menus/:id", async (req, res) => {
            const id = req.params.id;
            const result = await menuCollections.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // Delete User
        app.delete("/users/:id", async (req, res) => {
            const id = req.params.id;
            const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // Create Payment Intent
        app.post("/create-payment-intent", async (req, res) => {
            const { totalPrice } = req.body;
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: totalPrice * 100, // BDT to paisa
                    currency: "bdt",
                    payment_method_types: ["card"],
                });
                res.send({ clientSecret: paymentIntent.client_secret });
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });




        // Save Order
        app.post("/orders", async (req, res) => {
            try {
                const order = req.body;

                // sanitize cart
                order.cart = order.cart.map(item => ({
                    _id: item._id,
                    name: item.name,
                    price: Number(item.price),
                    image: item.image
                }));

                order.createdAt = new Date();
                order.paymentStatus = "paid";
                order.status = "pending";
                order.rating = null;

                const result = await ordersCollection.insertOne(order);
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });




        // oder get
        app.get("/orders", async (req, res) => {
            const orders = await ordersCollection.find().toArray();
            res.send(orders);
        });


        // GET user-specific orders
        // Example: GET /orders/my?email=user@example.comapp.get("/orders/my", async (req, res) => {
        app.get("/orders/my", async (req, res) => {
            const { email } = req.query;
            if (!email) return res.status(400).send("Email required");
            const orders = await ordersCollection.find({ email })
                .project({
                    rating: 1,
                    name: 1,
                    phone: 1,
                    orderType: 1,
                    cart: 1,
                    address: 1,
                    tableNo: 1,
                    status: 1,
                    adminMessage: 1,
                    paymentStatus: 1,
                    date: 1
                }).toArray();
            res.send(orders);
        });





        // admin order confirmed

        app.patch("/orders/confirm/:id", async (req, res) => {
            const { message } = req.body;
            const id = req.params.id;

            const result = await ordersCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        status: "confirmed",
                        adminMessage: message
                    }
                }
            );

            res.send(result);
        });




        // user rating
        app.patch("/menus/rating/:orderId", async (req, res) => {
            const { rating } = req.body;
            const orderId = req.params.orderId;

            if (!rating) {
                return res.status(400).send({ message: "Rating required" });
            }

            const order = await ordersCollection.findOne({ _id: new ObjectId(orderId) });
            if (!order) {
                return res.status(404).send({ message: "Order not found" });
            }

            // ⭐ Prevent double rating
            if (order.rated) {
                return res.status(400).send({ message: "Already rated" });
            }

            // 1️⃣ Update menu rating
            for (const item of order.cart) {
                await menuCollections.updateOne(
                    { _id: new ObjectId(item._id) },
                    {
                        $inc: {
                            totalRating: rating,
                            ratingCount: 1
                        }
                    }
                );

                const menu = await menuCollections.findOne({ _id: new ObjectId(item._id) });
                const avgRating = menu.totalRating / menu.ratingCount;

                await menuCollections.updateOne(
                    { _id: new ObjectId(item._id) },
                    { $set: { avgRating: Number(avgRating.toFixed(1)) } }
                );
            }

            // 2️⃣ Update order (IMPORTANT PART)
            await ordersCollection.updateOne(
                { _id: new ObjectId(orderId) },
                {
                    $set: {
                        rated: true,
                        rating: rating
                    }
                }
            );

            res.send({ success: true });
        });



        // Top 9 menus by avgRating
        app.get("/menus/top", async (req, res) => {
            try {
                const topMenus = await menuCollections
                    .find()
                    .sort({ avgRating: -1 })   // descending by avgRating
                    .limit(9)
                    .toArray();
                res.send(topMenus);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Failed to fetch top menus" });
            }
        });




        console.log(" MongoDB connected successfully!");
    } catch (err) {
        console.error(" Error connecting to MongoDB:", err);
    }
}

run().catch(console.dir);

if (process.env.NODE_ENV !== "production") {
    const port = process.env.PORT || 5000;
    app.listen(port, () => console.log(` Server running on http://localhost:${port}`));
} else {
    module.exports = app;
}
