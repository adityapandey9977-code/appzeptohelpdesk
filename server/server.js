const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/appzeto-helpdesk';

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    await seedAgents();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });

async function seedAgents() {
  try {
    const Agent = require('./models/Agent');
    const count = await Agent.countDocuments();
    if (count === 0) {
      const agents = [
        { name: 'Riya', maxLoad: 3 },
        { name: 'Karan', maxLoad: 4 },
        { name: 'Dev', maxLoad: 5 }
      ];
      await Agent.insertMany(agents);
      console.log('Seeded initial agents Riya, Karan, Dev');
    }
  } catch (error) {
    console.error('Error seeding agents:', error);
  }
}

// Mount routes
app.use('/api/tickets', require('./routes/tickets'));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
