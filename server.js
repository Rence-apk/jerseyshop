require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');
const bodyParser = require('body-parser');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const QRCode = require('qrcode'); 

// Import Model (if using Mongoose, otherwise you can remove this)
const Order = require('./models/Order.js');
const Logo = require('./models/Customized.js')

const app = express();
const port = process.env.PORT || 3000;

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer storage with Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'products',
        allowed_formats: ['jpg', 'jpeg', 'png'],
    },
});

const upload = multer({ storage });

// MongoDB Setup
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
let database;

app.use(bodyParser.json());

// Connect to MongoDB and initialize the database
async function connectToDatabase() {
    try {
        await client.connect();
        console.log('Connected to MongoDB Atlas!');
        database = client.db('sportswearDB'); // Replace with your database name
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }
}

// Middleware to ensure database is initialized
const ensureDatabaseInitialized = (req, res, next) => {
    if (!database) {
        return res.status(500).json({ message: 'Database not initialized. Please try again later.' });
    }
    next();
};

// Use the middleware in your routes
app.use(ensureDatabaseInitialized);

// Register Route
app.post('/register', async (req, res) => {
    const { name, email, password, fingerprint } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Please provide all fields' });
    }

    try {
        const collection = database.collection('admin');
        const existingAdmin = await collection.findOne({ email });

        if (existingAdmin) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newAdmin = {
            name,
            email,
            password: hashedPassword,
            fingerprint: fingerprint || null,
        };

        await collection.insertOne(newAdmin);

        res.status(201).json({ message: 'Admin registered successfully' });
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ message: 'Registration failed', error });
    }
});

//route to login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
        const collection = database.collection('admin');
        const user = await collection.findOne({ email });

        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        res.status(200).json({ 
            message: 'Login successful', 
            id: user._id, 
            email: user.email, 
            name: user.name // Include the user's name in the response
        });
    } catch (error) {
        res.status(500).json({ message: 'Error logging in', error: error.message });
    }
});


app.post('/login-with-id', async (req, res) => {
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({ message: 'ID is required' });
    }

    try {
        const collection = database.collection('admin');
        const user = await collection.findOne({ _id: new ObjectId(id) });

        if (!user) {
            return res.status(401).json({ message: 'Invalid ID' });
        }

        res.status(200).json({
            message: 'Login successful',
            id: user._id,
            email: user.email,
            name: user.name, // Include the user's name in the response
        });
    } catch (error) {
        res.status(500).json({ message: 'Error logging in', error: error.message });
    }
});


// Product Routes
app.get('/products', async (req, res) => {
    try {
        const collection = database.collection('products');
        const products = await collection.find({}).toArray();
        res.status(200).json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Error fetching products', error: error.message });
    }
});

// Route to add product
app.post('/products', upload.single('image'), async (req, res) => {
    const { name, category, price, size, description } = req.body;

    if (!name || !category || !price || !size) {
        return res.status(400).json({ message: 'Please provide all required fields' });
    }

    try {
        const collection = database.collection('products');
        const newProduct = {
            name,
            category,
            price: parseFloat(price),
            size,
            image: req.file.path, // Cloudinary URL
            description: description || '',
        };

        await collection.insertOne(newProduct);
        res.status(201).json({ message: 'Product added successfully', product: newProduct });
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ message: 'Error adding product', error: error.message });
    }
});

// Route to edit/update a product
app.put('/products/:id', async (req, res) => {
    const { id } = req.params;
    const { name, category, price, size, image, description } = req.body;

    // Check if required fields are provided
    if (!name || !category || !price || !size) {
        return res.status(400).json({ message: 'Please provide all required fields' });
    }

    try {
        const collection = database.collection('products');
        const updatedProduct = {
            name,
            category,
            price: parseFloat(price),
            size,
            image: image || null,
            description: description || '',
        };

        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedProduct }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json({ message: 'Product updated successfully', updatedProduct });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ message: 'Error updating product', error: error.message });
    }
});

// Route to delete products
app.delete('/products/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const collection = database.collection('products');
        const result = await collection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ message: 'Error deleting product', error: error.message });
    }
});

// Route to get all products
app.get('/all/products', async (req, res) => {
    try {
        const collection = database.collection('products');
        const products = await collection.find({}).toArray();
        res.status(200).json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Error fetching products', error: error.message });
    }
});

// API endpoint to get all orders using MongoDB native driver
app.get('/api/orders', async (req, res) => {
    try {
        const ordersCollection = database.collection('orders'); 
        const orders = await ordersCollection.find({}).toArray(); 
        res.status(200).json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error.message);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

// API endpoint to get a specific order by ID
app.get('/api/orders/:id', async (req, res) => {
    const { id } = req.params;

    // Validate the ID format (assuming MongoDB ObjectId)
    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid order ID format' });
    }

    try {
        const ordersCollection = database.collection('orders');
        const order = await ordersCollection.findOne({ _id: new ObjectId(id) }); 

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        
        // Return only the id and status of the order
        res.status(200).json({ id: order._id, status: order.status });
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message }); 
    }
});

// API endpoint to update order status to 'complete'
app.post('/api/orders/:orderId/complete', async (req, res) => {
    const { orderId } = req.params;

    // Validate the ObjectId format
    if (!ObjectId.isValid(orderId)) {
        return res.status(400).json({ message: 'Invalid order ID format' });
    }

    try {
        const ordersCollection = database.collection('orders'); 

        // Update the order status to 'complete'
        const result = await ordersCollection.updateOne(
            { _id: new ObjectId(orderId) },
            { $set: { status: 'complete' } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.status(200).json({ message: 'Order status updated to complete' });
    } catch (error) {
        console.error('Error updating order status:', error.message);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

// Route to get all admins
app.get('/api/admins', async (req, res) => {
    try {
        const collection = database.collection('admin'); // Access the 'admin' collection
        const admins = await collection.find({}).toArray(); // Fetch all admins
        res.status(200).json(admins);
    } catch (error) {
        console.error('Error fetching admins:', error.message);
        res.status(500).json({ error: 'Failed to fetch admins' });
    }
});

// app.get('/api/logos', async (req, res) => {
//     try {
//         const logosCollection = database.collection('logos'); // Replace with the actual collection name
//         const logos = await logosCollection.find({}).toArray(); // Fetch all logo documents
//         res.status(200).json(logos); // Send the logos as JSON
//     } catch (err) {
//         console.error('Error fetching logos:', err.message);
//         res.status(500).json({ message: 'Server error', error: err.message });
//     }
// });

// // Get details of a specific logo
// app.get('/logos/:id', async (req, res) => {
//     try {
//         const { id } = req.params;

//         // Validate the ObjectId format
//         if (!ObjectId.isValid(id)) {
//             return res.status(400).json({ message: 'Invalid logo ID format' });
//         }

//         const logo = await database.collection('logos').findOne({ _id: new ObjectId(id) });

//         if (!logo) {
//             return res.status(404).json({ message: 'Logo not found' });
//         }

//         res.status(200).json(logo);
//     } catch (error) {
//         console.error('Error fetching logo details:', error.message);
//         res.status(500).json({ message: 'Error fetching logo details', error: error.message });
//     }
// });


// Get all logos
app.get('/api/logos', async (req, res) => {
    try {
        const logosCollection = database.collection('logos'); // Ensure correct collection name
        const logos = await logosCollection.find({}).toArray(); // Fetch all logo documents
        res.status(200).json(logos); // Return all logos as JSON
    } catch (err) {
        console.error('Error fetching logos:', err.message);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Get details of a specific logo
app.get('/api/logos/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid logo ID format' });
        }

        const logo = await database.collection('logos').findOne({ _id: new ObjectId(id) });

        if (!logo) {
            return res.status(404).json({ message: 'Logo not found' });
        }

        res.status(200).json(logo);
    } catch (error) {
        console.error('Error fetching logo details:', error.message);
        res.status(500).json({ message: 'Error fetching logo details', error: error.message });
    }
});

// API endpoint to update logo status to 'complete'
app.post('/api/logos/:id/complete', async (req, res) => {
    const { id } = req.params;

    // Validate the ObjectId format
    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid logo ID format' });
    }

    try {
        const logosCollection = database.collection('logos'); 

        // Update the logo's approval status to 'true' (completed)
        const result = await logosCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { approval: true } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Logo not found' });
        }

        res.status(200).json({ message: 'Logo status updated to complete' });
    } catch (error) {
        console.error('Error updating logo status:', error.message);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

// Define the route to get total amount and price
app.get('/api/total', async (req, res) => {
    try {
        // Calculate total price from Logo collection
        const totalPrice = await database.collection('logos').aggregate([
            { $group: { _id: null, totalPrice: { $sum: "$price" } } }
        ]).toArray();

        // Calculate total amount from Order collection
        const totalAmount = await database.collection('orders').aggregate([
            { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
        ]).toArray();

        res.json({
            totalPrice: totalPrice[0]?.totalPrice || 0,
            totalAmount: totalAmount[0]?.totalAmount || 0
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching data', error: error.message });
    }
});

// Endpoint to fetch sales statistics
app.get('/api/sales-stats', async (req, res) => {
    try {
        const totalSales = await database.collection('orders').aggregate([
            { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
        ]).toArray();

        const weeklySales = await database.collection('orders').aggregate([
            { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
            { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
        ]).toArray();

        const monthlySales = await database.collection('orders').aggregate([
            { $match: { createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } },
            { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
        ]).toArray();

        const yearlySales = await database.collection('orders').aggregate([
            { $match: { createdAt: { $gte: new Date(new Date().getFullYear(), 0, 1) } } },
            { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
        ]).toArray();

        res.json({
            weeklySales: weeklySales[0]?.totalAmount || 0,
            monthlySales: monthlySales[0]?.totalAmount || 0,
            yearlySales: yearlySales[0]?.totalAmount || 0,
            totalSales: totalSales[0]?.totalAmount || 0,
            salesByMonth: [3000, 4200, 3500, 5200, 6000, 7200, 8000, 8500, 9000, 9500, 10000, 11000] // Example data, can be dynamically fetched
        });
    } catch (error) {
        console.error('Error fetching sales statistics:', error.message);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

// Start the server
app.listen(port, async () => {
    await connectToDatabase();
    console.log(`Server running on http://localhost:${port}`);
});
