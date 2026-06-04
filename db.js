const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Enforce MongoDB only
const DB_TYPE = "mongodb";

console.log(`📡 Selected Database Type: ${DB_TYPE.toUpperCase()}`);

// ORM instances
const LeadModel = mongoose.models.Lead || require("./models/Lead");
const AdminModel = mongoose.models.Admin || require("./models/Admin");

// -------------------------------------------------------------
// UNIFIED MODEL WRAPPERS
// -------------------------------------------------------------

// Lead Wrapper
const Lead = {
  async create(data) {
    // Normalize status to lowercase
    if (data.status) data.status = data.status.toLowerCase();
    
    const lead = await LeadModel.create(data);
    return lead.toJSON();
  },

  find() {
    let mongoQuery = LeadModel.find();

    return {
      sort(sortObj) {
        mongoQuery = mongoQuery.sort(sortObj);
        return this;
      },

      async then(resolve, reject) {
        try {
          const results = await mongoQuery;
          resolve(results.map(r => r.toJSON()));
        } catch (err) {
          if (reject) reject(err);
          else throw err;
        }
      }
    };
  },

  async findById(id) {
    const lead = await LeadModel.findById(id);
    return lead ? lead.toJSON() : null;
  },

  async findByIdAndUpdate(id, body, options = {}) {
    // Normalize status to lowercase
    if (body.status) body.status = body.status.toLowerCase();

    const lead = await LeadModel.findByIdAndUpdate(id, body, { new: true });
    return lead ? lead.toJSON() : null;
  },

  async findByIdAndDelete(id) {
    const lead = await LeadModel.findByIdAndDelete(id);
    return lead ? lead.toJSON() : null;
  }
};

// Admin Wrapper
const Admin = {
  async findOne({ username }) {
    const admin = await AdminModel.findOne({ username });
    return admin ? admin.toJSON() : null;
  },

  async create(data) {
    const admin = await AdminModel.create(data);
    return admin.toJSON();
  },

  async findByIdAndUpdate(id, body) {
    const admin = await AdminModel.findByIdAndUpdate(id, body, { new: true });
    return admin ? admin.toJSON() : null;
  },

  async count() {
    return await AdminModel.countDocuments();
  }
};

// -------------------------------------------------------------
// CONNECTION ENGINE & SEEDER
// -------------------------------------------------------------

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGO_URI or MONGODB_URI is not set in environment variables");
    }
    await mongoose.connect(uri);
    console.log("✅ MongoDB Connected Successfully");

    // Seed default admin account
    const adminCount = await Admin.count();
    if (adminCount === 0) {
      const seedUsername = process.env.ADMIN_USERNAME || "admin";
      const seedPassword = process.env.ADMIN_PASSWORD || "admin123";
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(seedPassword, salt);
      
      await Admin.create({
        username: seedUsername,
        password: hashedPassword
      });
      console.log(`🌱 Seeded default admin account: "${seedUsername}"`);
    }
  } catch (err) {
    console.error("❌ Database Connection/Sync Error:", err.message);
    process.exit(1);
  }
};

module.exports = {
  connectDB,
  Lead,
  Admin,
  DB_TYPE
};