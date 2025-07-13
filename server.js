 
// server.js
// Freightcom Mock API Server for Designer Deck - PRD Focused
// Based on PRD requirements for freightcom_shipping module

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// In-memory storage for rate requests
const rateRequests = new Map();

// Mock rate data based on PRD requirements
function generateMockRates(packagingType, origin, destination) {
  const baseRates = {
    package: [
      {
        carrier_name: "Canada Post",
        service_name: "Expedited Parcel",
        service_id: "CP_EXPEDITED",
        valid_until: { year: 2025, month: 12, day: 31 },
        total: { currency: "CAD", value: "1550" },
        base: { currency: "CAD", value: "1225" },
        surcharges: [
          { type: "fuel", amount: { currency: "CAD", value: "195" } },
          { type: "residential", amount: { currency: "CAD", value: "130" } }
        ],
        taxes: [],
        transit_time_days: 3,
        transit_time_not_available: false
      },
      {
        carrier_name: "Canada Post",
        service_name: "Regular Parcel",
        service_id: "CP_REGULAR",
        valid_until: { year: 2025, month: 12, day: 31 },
        total: { currency: "CAD", value: "1225" },
        base: { currency: "CAD", value: "975" },
        surcharges: [
          { type: "fuel", amount: { currency: "CAD", value: "150" } },
          { type: "residential", amount: { currency: "CAD", value: "100" } }
        ],
        taxes: [],
        transit_time_days: 5,
        transit_time_not_available: false
      },
      {
        carrier_name: "Purolator",
        service_name: "Ground",
        service_id: "PUR_GROUND",
        valid_until: { year: 2025, month: 12, day: 31 },
        total: { currency: "CAD", value: "1875" },
        base: { currency: "CAD", value: "1500" },
        surcharges: [
          { type: "fuel", amount: { currency: "CAD", value: "225" } },
          { type: "residential", amount: { currency: "CAD", value: "150" } }
        ],
        taxes: [],
        transit_time_days: 2,
        transit_time_not_available: false
      }
    ],
    pallet: [
      {
        carrier_name: "Day & Ross",
        service_name: "LTL Standard",
        service_id: "DR_LTL_STD",
        valid_until: { year: 2025, month: 12, day: 31 },
        total: { currency: "CAD", value: "12500" },
        base: { currency: "CAD", value: "10000" },
        surcharges: [
          { type: "fuel", amount: { currency: "CAD", value: "1500" } },
          { type: "residential_delivery", amount: { currency: "CAD", value: "750" } },
          { type: "lift_gate", amount: { currency: "CAD", value: "250" } }
        ],
        taxes: [],
        transit_time_days: 5,
        transit_time_not_available: false
      },
      {
        carrier_name: "Day & Ross",
        service_name: "LTL Express",
        service_id: "DR_LTL_EXP",
        valid_until: { year: 2025, month: 12, day: 31 },
        total: { currency: "CAD", value: "18500" },
        base: { currency: "CAD", value: "15000" },
        surcharges: [
          { type: "fuel", amount: { currency: "CAD", value: "2250" } },
          { type: "residential_delivery", amount: { currency: "CAD", value: "750" } },
          { type: "lift_gate", amount: { currency: "CAD", value: "250" } },
          { type: "express", amount: { currency: "CAD", value: "250" } }
        ],
        taxes: [],
        transit_time_days: 2,
        transit_time_not_available: false
      },
      {
        carrier_name: "Purolator Freight",
        service_name: "LTL",
        service_id: "PUR_LTL",
        valid_until: { year: 2025, month: 12, day: 31 },
        total: { currency: "CAD", value: "14550" },
        base: { currency: "CAD", value: "11750" },
        surcharges: [
          { type: "fuel", amount: { currency: "CAD", value: "1765" } },
          { type: "residential_delivery", amount: { currency: "CAD", value: "785" } },
          { type: "lift_gate", amount: { currency: "CAD", value: "250" } }
        ],
        taxes: [],
        transit_time_days: 3,
        transit_time_not_available: false
      }
    ]
  };

  // PRD requirement: Distance-based pricing variation
  const rates = JSON.parse(JSON.stringify(baseRates[packagingType] || baseRates.package));
  
  // Simulate realistic pricing based on distance
  const distance = Math.random() * 500 + 100; // 100-600 km across Canada
  const distanceMultiplier = Math.max(0.8, Math.min(1.5, distance / 300));
  
  rates.forEach(rate => {
    const baseValue = parseInt(rate.base.value);
    const newBaseValue = Math.round(baseValue * distanceMultiplier);
    rate.base.value = newBaseValue.toString();
    
    // Recalculate total
    const surchargeTotal = rate.surcharges.reduce((sum, s) => sum + parseInt(s.amount.value), 0);
    const taxTotal = rate.taxes.reduce((sum, t) => sum + parseInt(t.amount.value), 0);
    rate.total.value = (newBaseValue + surchargeTotal + taxTotal).toString();
  });

  return rates;
}

// PRD Requirement FR-003: Rate Request (POST /rate)
app.post('/rate', (req, res) => {
  const requestId = uuidv4();
  const { services, excluded_services, details } = req.body;
  
  console.log('📦 Rate request for packaging type:', details.packaging_type);
  console.log('🏠 Destination type:', details.destination.residential ? 'Residential' : 'Commercial');
  
  // Store the request for polling (PRD requirement: polling-based)
  rateRequests.set(requestId, {
    id: requestId,
    request: req.body,
    status: 'processing',
    created: Date.now()
  });
  
  // PRD Requirement: Rate calculation response ≤ 3 seconds
  setTimeout(() => {
    const rates = generateMockRates(
      details.packaging_type,
      details.origin,
      details.destination
    );
    
    // Filter by services if specified
    let filteredRates = rates;
    if (services && services.length > 0) {
      filteredRates = rates.filter(rate => services.includes(rate.service_id));
    }
    if (excluded_services && excluded_services.length > 0) {
      filteredRates = filteredRates.filter(rate => !excluded_services.includes(rate.service_id));
    }
    
    rateRequests.set(requestId, {
      id: requestId,
      request: req.body,
      status: 'completed',
      rates: filteredRates,
      created: Date.now()
    });
    
    console.log(`✅ Generated ${filteredRates.length} rates for request ${requestId}`);
  }, 1000); // 1 second - well under 3 second requirement
  
  res.status(202).json({
    request_id: requestId
  });
});

// PRD Requirement FR-003: Rate Polling (GET /rate/{id})
app.get('/rate/:rate_id', (req, res) => {
  const rateId = req.params.rate_id;
  const rateRequest = rateRequests.get(rateId);
  
  if (!rateRequest) {
    return res.status(404).json({ message: 'Rate request not found' });
  }
  
  if (rateRequest.status === 'processing') {
    return res.status(200).json({
      status: {
        done: false,
        total: 3,
        complete: 1
      },
      rates: []
    });
  }
  
  console.log(`📋 Returning ${rateRequest.rates.length} completed rates for ${rateId}`);
  
  res.status(200).json({
    status: {
      done: true,
      total: rateRequest.rates.length,
      complete: rateRequest.rates.length
    },
    rates: rateRequest.rates
  });
});

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '2.5.2',
    uptime: process.uptime()
  });
});

// Root endpoint with PRD-specific API info
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Freightcom Mock API Server - Designer Deck',
    version: '2.5.2',
    description: 'Mock API server for Designer Deck freightcom_shipping module',
    features: [
      'Two-type shipping classification (package/pallet)',
      'Canadian carriers: Canada Post, Purolator, Day & Ross',
      'Residential vs Commercial pricing',
      'Distance-based rate calculation',
      'Polling-based rate requests',
      'Sub-3-second response times'
    ],
    endpoints: {
      rate_request: 'POST /rate',
      get_rates: 'GET /rate/{id}',
      health_check: 'GET /health'
    },
    packaging_types: {
      package: 'For outdoor lighting, hardware, accessories, samples',
      pallet: 'For elevated tiles, support systems, lumber, composite'
    }
  });
});

// PRD Requirement: Error handling with user-friendly messages
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ 
    message: 'Shipping rate calculation temporarily unavailable',
    error: 'Please try again or contact support',
    fallback: 'Manual shipping quote available'
  });
});

// 404 handler
app.use((req, res) => {
  console.log(`❓ 404 - Endpoint not found: ${req.method} ${req.path}`);
  res.status(404).json({ 
    message: 'Endpoint not found',
    available_endpoints: [
      'GET /',
      'GET /health', 
      'POST /rate',
      'GET /rate/{id}'
    ]
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('\n🚀 Freightcom Mock API Server for Designer Deck');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log('\n📋 PRD-Compliant Features:');
  console.log('  ✅ Two-type shipping classification (package/pallet)');
  console.log('  ✅ Canada Post, Purolator, Day & Ross rates');
  console.log('  ✅ Residential vs Commercial detection');
  console.log('  ✅ Rate calculation ≤ 3 seconds (PRD NFR-001)');
  console.log('  ✅ Polling-based rate requests (PRD FR-003)');
  console.log('  ✅ Mock API support for development');
  console.log('  ✅ Distance-based pricing variation');
  console.log('  ✅ Error handling with fallback messages');
  console.log('\n🏗️ Designer Deck Product Types:');
  console.log('  📦 Parcel: Outdoor lighting, hardware, accessories, samples');
  console.log('  🚛 LTL/Pallet: Elevated tiles, support systems, lumber, composite');
  console.log('\n🎯 Ready for freightcom_shipping module integration!');
});

module.exports = app;