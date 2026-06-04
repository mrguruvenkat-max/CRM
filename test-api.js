/**
 * Apex CRM Enterprise - Automated Backend API Verification Suite
 * Verifies all database operations, credentials cryptography, and lead lifecycle endpoints.
 */

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log("\n🧪 STARTING APEX CRM AUTOMATED VERIFICATION SUITE\n");
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  let token = "";
  let leadId = "";

  try {
    // -------------------------------------------------------------
    // Test 1: Database initialization and sync
    // -------------------------------------------------------------
    const testRes = await fetch(`${BASE_URL}/test`);
    const testData = await testRes.json();
    assert(testRes.ok && testData.success === true, "Database initialization and sync status check");
    console.log(`   (Database type active: ${testData.database})`);

    // -------------------------------------------------------------
    // Test 2: Credentials cryptography verification
    // -------------------------------------------------------------
    // Try invalid login first
    const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "wrongpassword" })
    });
    assert(badLoginRes.status === 401, "Invalid login rejected (401)");

    // Try valid login
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin123" })
    });
    const loginData = await loginRes.json();
    assert(loginRes.ok && loginData.success === true && !!loginData.token, "Admin authentication and JWT generation");
    token = loginData.token;

    // Verify session
    const verifyRes = await fetch(`${BASE_URL}/api/auth/verify`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const verifyData = await verifyRes.json();
    assert(verifyRes.ok && verifyData.username === "admin", "Session verification and token decoding");

    // -------------------------------------------------------------
    // Test 3: Client lead creation
    // -------------------------------------------------------------
    const newLeadPayload = {
      name: "Bruce Wayne",
      email: "bruce@waynecorp.com",
      phone: "555-0199",
      company: "Wayne Enterprises",
      source: "Website Form",
      message: "Looking for advanced CRM database configurations.",
      budget: 85000
    };
    const createRes = await fetch(`${BASE_URL}/api/public/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newLeadPayload)
    });
    const createData = await createRes.json();
    assert(createRes.status === 201 && createData.success === true, "Public lead intake capturing");
    leadId = createData.lead.id || createData.lead._id;
    assert(!!leadId, "Lead ID successfully generated");

    // -------------------------------------------------------------
    // Test 4: Search, filters, and query indexes
    // -------------------------------------------------------------
    const getLeadsRes = await fetch(`${BASE_URL}/api/admin/leads`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const leadsList = await getLeadsRes.json();
    assert(getLeadsRes.ok && Array.isArray(leadsList), "Fetch all leads (protected admin route)");
    
    const foundLead = leadsList.find(l => (l.id || l._id) === leadId);
    assert(!!foundLead && foundLead.name === "Bruce Wayne", "Search and query index retrieval of created lead");

    // -------------------------------------------------------------
    // Test 5: Timeline logs appending
    // -------------------------------------------------------------
    const noteContent = "Called client. Left a voicemail.";
    const noteRes = await fetch(`${BASE_URL}/api/admin/leads/${leadId}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ content: noteContent })
    });
    const noteData = await noteRes.json();
    assert(noteRes.ok && noteData.notes.some(n => n.content === noteContent), "Append interaction activity timeline notes");

    // -------------------------------------------------------------
    // Test 6: Pipeline stage transitions
    // -------------------------------------------------------------
    const transitionRes = await fetch(`${BASE_URL}/api/admin/leads/${leadId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        status: "contacted",
        priority: "high",
        assignedTo: "Sarah Jenkins",
        temperature: "hot"
      })
    });
    const transitionData = await transitionRes.json();
    assert(
      transitionRes.ok && 
      transitionData.status === "contacted" && 
      transitionData.priority === "high" &&
      transitionData.assignedTo === "Sarah Jenkins",
      "Pipeline stage transitions and representative allocation"
    );

    // Verify system notes was automatically generated for audit logging
    assert(
      transitionData.notes.some(n => n.author === "System" && n.content.includes("Status changed")),
      "System auto-audit note generation for pipeline changes"
    );

    // -------------------------------------------------------------
    // Test 7: KPI aggregations and dashboard stats
    // -------------------------------------------------------------
    const statsRes = await fetch(`${BASE_URL}/api/admin/stats`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const statsData = await statsRes.json();
    assert(
      statsRes.ok && 
      statsData.totalLeads > 0 && 
      statsData.totalPipelineValue >= 85000 &&
      statsData.funnel.contacted >= 1,
      "KPI aggregation metrics and dashboard statistics"
    );

    // -------------------------------------------------------------
    // Test 8: Deletion sanitization
    // -------------------------------------------------------------
    const deleteRes = await fetch(`${BASE_URL}/api/admin/leads/${leadId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert(deleteRes.ok, "Delete lead (protected admin route)");

    // Verify it is gone
    const checkDeletedRes = await fetch(`${BASE_URL}/api/admin/leads/${leadId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert(checkDeletedRes.status === 404, "Deletion sanitization confirmed (lead no longer exists)");

  } catch (error) {
    console.error("💥 Critical test execution crash:", error);
    failed++;
  }

  console.log("\n📊 VERIFICATION SUITE RESULTS SUMMARY:");
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(failed === 0 ? "🎉 ALL TESTS PASSED SUCCESSFULLY!" : "⚠️ SOME TESTS FAILED.");
  
  process.exit(failed === 0 ? 0 : 1);
}

runTests();
