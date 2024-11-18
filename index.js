const express = require('express');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./Models/UserModel');
const Task = require('./Models/TaskModel');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch((err) => console.error('MongoDB connection error:', err));

// Authentication Middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        
        // Verify user exists
        const user = await User.findById(verified.id);
        if (!user) {
            return res.status(401).json({ error: 'Invalid token. User not found.' });
        }

        req.user = verified;
        next();
    } catch (error) {
        res.status(400).json({ error: 'Invalid or expired token.' });
    }
};

// Registration Route
app.post('/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Please provide name, email, and password' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already in use' });
        }

        // Create new user
        const newUser = new User({ 
            name,
            email,
            password
        });

        await newUser.save();

        // Generate token
        const token = jwt.sign(
            { id: newUser._id }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.status(201).json({ 
            message: 'User registered successfully',
            user: { 
                id: newUser._id, 
                name: newUser.name, 
                email: newUser.email 
            },
            token 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

// Login Route
app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token
        const token = jwt.sign(
            { id: user._id }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.status(200).json({ 
            message: 'Login successful',
            token 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Task Routes
// Create Task
app.post('/tasks', authenticateToken, async (req, res) => {
    try {
        const { title, description, status, priority, dueDate } = req.body;

        // Validate required fields
        if (!title || !description || !dueDate) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const task = new Task({
            title,
            description,
            status: status || 'pending',
            priority: priority || 'medium',
            dueDate: new Date(dueDate),
            userId: req.user.id
        });

        const savedTask = await task.save();
        res.status(201).json(savedTask);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creating task' });
    }
});

// Get All Tasks
app.get('/tasks', authenticateToken, async (req, res) => {
    try {
        // Optional query parameters for filtering and sorting
        const { status, priority, sort } = req.query;
        
        let query = { userId: req.user.id };
        
        // Add optional filters
        if (status) query.status = status;
        if (priority) query.priority = priority;

        // Default sort by due date
        const tasks = await Task.find(query).sort({ 
            dueDate: sort === 'desc' ? -1 : 1 
        });

        res.status(200).json(tasks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching tasks' });
    }
});

// Get Single Task
app.get('/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const task = await Task.findOne({ 
            _id: req.params.id, 
            userId: req.user.id 
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.status(200).json(task);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching task' });
    }
});

// Update Task
app.put('/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const { title, description, status, priority, dueDate } = req.body;

        const updatedTask = await Task.findOneAndUpdate(
            { 
                _id: req.params.id, 
                userId: req.user.id 
            },
            { 
                title, 
                description, 
                status, 
                priority, 
                dueDate 
            },
            { 
                new: true,  // Return updated document
                runValidators: true  // Run model validations
            }
        );

        if (!updatedTask) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.status(200).json(updatedTask);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error updating task' });
    }
});

// Delete Task
app.delete('/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const deletedTask = await Task.findOneAndDelete({ 
            _id: req.params.id, 
            userId: req.user.id 
        });

        if (!deletedTask) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.status(200).json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error deleting task' });
    }
});

// Reminder Route (Optional)
app.post('/tasks/:id/reminder', authenticateToken, async (req, res) => {
    try {
        const { reminderDate } = req.body;

        if (!reminderDate) {
            return res.status(400).json({ error: 'Missing reminder date' });
        }

        const task = await Task.findOne({ 
            _id: req.params.id, 
            userId: req.user.id 
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        task.reminderDate = new Date(reminderDate);
        await task.save();

        res.status(200).json({ 
            message: 'Reminder set successfully',
            task 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error setting reminder' });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});