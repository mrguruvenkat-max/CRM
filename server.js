require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { connectDB, Lead, Admin, DB_TYPE } = require("./db");

const app = express();

// Connect to Database
connectDB();

// Middleware
app.use(cors({
  origin: [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://localhost:5000",
    "http://127.0.0.1:5000"
  ]
}));

app.use(express.json());

// Serve frontend static files from the root directory
app.use(express.static(__dirname));

// JWT Authentication Middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "crm_super_secret_session_token_key_2026");
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token." });
  }
};

// ==========================================================================
// PUBLIC ROUTES
// ==========================================================================

// Test Route
app.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "API Working",
    database: DB_TYPE
  });
});

// Public Lead Intake (Website contact form endpoint)
app.post("/api/public/leads", async (req, res) => {
  try {
    const { name, email, phone, company, source, message, budget } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: "Name and email are required"
      });
    }

    const leadData = {
      name,
      email,
      phone: phone || "",
      company: company || "",
      source: source || "Website Form",
      message: message || "",
      budget: budget ? Number(budget) : 0,
      status: "new",
      priority: "medium",
      assignedTo: "Unassigned",
      temperature: "warm",
      notes: [
        {
          content: "Lead ingested via website contact form.",
          author: "Form Intake",
          date: new Date().toISOString()
        }
      ]
    };

    const lead = await Lead.create(leadData);

    res.status(201).json({
      success: true,
      lead
    });
  } catch (error) {
    console.error("Lead Intake Error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================================================
// AUTH ROUTES
// ==========================================================================

// Login endpoint (handles /api/auth/login and legacy /api/admin/login)
const handleLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET || "crm_super_secret_session_token_key_2026",
      { expiresIn: "1d" }
    );

    res.json({
      success: true,
      token,
      username: admin.username
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: error.message });
  }
};

app.post("/api/auth/login", handleLogin);
app.post("/api/admin/login", handleLogin);

// Verify current session
app.get("/api/auth/verify", authMiddleware, (req, res) => {
  res.json({
    success: true,
    username: req.user.username
  });
});

// Change Admin Password
app.post("/api/admin/change-password", authMiddleware, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters long" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await Admin.findByIdAndUpdate(req.user.id, { password: hashedPassword });

    res.json({
      success: true,
      message: "Password updated successfully"
    });
  } catch (error) {
    console.error("Change Password Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================================================
// PROTECTED ADMIN LEAD CRUD & OPERATIONS
// ==========================================================================

// Get All Leads
app.get("/api/admin/leads", authMiddleware, async (req, res) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });
    res.json(leads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Single Lead Details
app.get("/api/admin/leads/:id", authMiddleware, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Lead Details (includes auto auditing timeline notes)
app.put("/api/admin/leads/:id", authMiddleware, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const updates = req.body;
    const notes = lead.notes ? [...lead.notes] : [];
    const auditLogs = [];

    if (updates.status && updates.status.toLowerCase() !== lead.status.toLowerCase()) {
      auditLogs.push(`Status changed from "${lead.status.toUpperCase()}" to "${updates.status.toUpperCase()}"`);
    }
    if (updates.assignedTo && updates.assignedTo !== lead.assignedTo) {
      auditLogs.push(`Assigned to "${updates.assignedTo}"`);
    }
    if (updates.priority && updates.priority !== lead.priority) {
      auditLogs.push(`Priority changed to "${updates.priority.toUpperCase()}"`);
    }
    if (updates.temperature && updates.temperature !== lead.temperature) {
      auditLogs.push(`Temperature changed to "${updates.temperature.toUpperCase()}"`);
    }
    if (updates.budget !== undefined && Number(updates.budget) !== Number(lead.budget)) {
      auditLogs.push(`Estimated budget set to $${Number(updates.budget).toLocaleString()}`);
    }
    if (updates.followUpDate !== undefined && updates.followUpDate !== lead.followUpDate) {
      const formattedDate = updates.followUpDate ? updates.followUpDate : "Cleared";
      auditLogs.push(`Next follow-up date: ${formattedDate}`);
    }

    if (auditLogs.length > 0) {
      notes.push({
        content: `System update: ${auditLogs.join(", ")}`,
        author: "System",
        date: new Date().toISOString()
      });
      updates.notes = notes;
    }

    const updatedLead = await Lead.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json(updatedLead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Lead
app.delete("/api/admin/leads/:id", authMiddleware, async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Append Interaction Activity Note
app.post("/api/admin/leads/:id/notes", authMiddleware, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const notes = lead.notes ? [...lead.notes] : [];
    notes.push({
      content: req.body.content,
      author: req.user.username || "Admin",
      date: new Date().toISOString()
    });

    const updatedLead = await Lead.findByIdAndUpdate(req.params.id, { notes }, { new: true });
    res.json(updatedLead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create Lead manually as Admin
app.post("/api/admin/leads", authMiddleware, async (req, res) => {
  try {
    const { name, email, phone, company, source, message, budget, status, priority, assignedTo, temperature, followUpDate } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: "Name and email are required"
      });
    }

    const leadData = {
      name,
      email,
      phone: phone || "",
      company: company || "",
      source: source || "Manual Entry",
      message: message || "",
      budget: budget ? Number(budget) : 0,
      status: status || "new",
      priority: priority || "medium",
      assignedTo: assignedTo || "Unassigned",
      temperature: temperature || "warm",
      followUpDate: followUpDate || null,
      notes: [
        {
          content: `Lead created manually by ${req.user.username || "Admin"}.`,
          author: "System",
          date: new Date().toISOString()
        }
      ]
    };
    
    if (message) {
      leadData.notes.push({
        content: message,
        author: req.user.username || "Admin",
        date: new Date().toISOString()
      });
    }

    const lead = await Lead.create(leadData);

    res.status(201).json({
      success: true,
      lead
    });
  } catch (error) {
    console.error("Manual Lead Creation Error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================================================
// ADMIN DASHBOARD ANALYTICS REPORT
// ==========================================================================

app.get("/api/admin/stats", authMiddleware, async (req, res) => {
  try {
    const leads = await Lead.find();

    const totalLeads = leads.length;
    const newLeads = leads.filter(l => l.status === "new").length;
    const contactedLeads = leads.filter(l => l.status === "contacted").length;
    const convertedLeads = leads.filter(l => l.status === "converted").length;
    const lostLeads = leads.filter(l => l.status === "lost").length;

    const totalPipelineValue = leads.reduce((sum, l) => sum + (Number(l.budget) || 0), 0);
    const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

    // Upcoming Follow-ups (leads with active followUpDate, sorted ascending)
    const upcomingFollowUps = leads
      .filter(l => l.followUpDate && l.followUpDate.trim() !== "")
      .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))
      .slice(0, 10);

    // Sales Representative Performance
    const defaultReps = ["Sarah Jenkins", "David Vance", "Alex Mercer", "Chloe Reed", "Unassigned"];
    const allReps = Array.from(new Set([...defaultReps, ...leads.map(l => l.assignedTo).filter(Boolean)]));

    const agentPerformance = allReps.map(repName => {
      const repLeads = leads.filter(l => l.assignedTo === repName);
      return {
        name: repName,
        assigned: repLeads.length,
        converted: repLeads.filter(l => l.status === "converted").length,
        value: repLeads.reduce((sum, l) => sum + (Number(l.budget) || 0), 0)
      };
    }).sort((a, b) => b.value - a.value);

    // Lead Sources Distribution
    const sources = {};
    leads.forEach(l => {
      const src = l.source || "Website Form";
      sources[src] = (sources[src] || 0) + 1;
    });

    // Monthly Growth Trends (based on YYYY-MM formatted string)
    const trendsMap = {};
    leads.forEach(l => {
      if (l.createdAt) {
        const date = new Date(l.createdAt);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        trendsMap[monthStr] = (trendsMap[monthStr] || 0) + 1;
      }
    });

    const monthlyTrends = Object.entries(trendsMap)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    if (monthlyTrends.length === 0) {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      monthlyTrends.push({ month: currentMonth, count: 0 });
    }

    // Pipeline Funnel drop-offs
    const funnel = {
      intake: totalLeads,
      contacted: contactedLeads + convertedLeads + lostLeads,
      qualified: contactedLeads + convertedLeads,
      converted: convertedLeads
    };

    res.json({
      totalLeads,
      newLeads,
      contactedLeads,
      convertedLeads,
      totalPipelineValue,
      conversionRate,
      upcomingFollowUps,
      agentPerformance,
      sources,
      monthlyTrends,
      funnel
    });
  } catch (error) {
    console.error("Stats Aggregation Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================================================
// START SERVER
// ==========================================================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});