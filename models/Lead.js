const mongoose = require("mongoose");

const LeadSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true
        },
        email: {
            type: String,
            required: true
        },
        phone: String,
        company: String,
        source: {
            type: String,
            default: "Website"
        },
        message: String,
        status: {
            type: String,
            default: "new"
        },
        priority: {
            type: String,
            default: "medium"
        },
        assignedTo: {
            type: String,
            default: "Unassigned"
        },
        temperature: {
            type: String,
            default: "warm"
        },
        budget: {
            type: Number,
            default: 0
        },
        followUpDate: {
            type: String,
            default: null
        },
        notes: {
            type: Array,
            default: []
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

module.exports = mongoose.model("Lead", LeadSchema);
