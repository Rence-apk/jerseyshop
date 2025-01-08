// logo.model.js
const mongoose = require('mongoose');

// Define the Logo schema
const logoSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  size: { type: String, required: true },
  description: { type: String, required: true },
  color: { type: String, required: true },
  price: { type: Number, required: true },
  imgUrl: { type: String },
  logoUrl: { type: String },
  notes: { type: String },
  approval: { type: Boolean, default: false },
});

const Logo = mongoose.model('Logo', logoSchema);

module.exports = Logo;