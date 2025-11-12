const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
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

        app.get("/", (req, res) => {
            res.send(" Smart Dine server is running perfectly!");
        });

        // All Users
        app.get("/users", async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
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
