// server.js - Fixed version with consistent pricing
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

// FIXED: Generate consistent rates based on address hash
function generateMockRates(packagingType, origin, destination) {
  // Create a simple hash from destination to ensure consistency
  const addressKey = `${destination.city}-${destination.zip}-${packagingType}`;
  const hash = addressKey.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  // Use hash to create consistent but varied pricing
  const priceVariation = Math.abs(hash % 100) / 100; // 0 to 1
  
  const baseRates = {
    package: [
      {
        carrier_name: "Canada Post",
        service_name: "Expedited Parcel",
        service_id: "CP_EXPEDITED",
        valid_until: { year: 2025, month: 12, day: 31 },
        total: { currency: "CAD", value: Math.round(1225 + (priceVariation * 200)).toString() },
        base: { currency: "CAD", value: Math.round(975 + (priceVariation * 150)).toString() },
        surcharges: [
          { type: "fuel", amount: { currency: "CAD", value: "150" } },
          { type: "residential", amount: { currency: "CAD", value: "100" } }
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
        total: { currency: "CAD", value: Math.round(975 + (priceVariation * 150)).toString() },
        base: { currency: "CAD", value: Math.round(775 + (priceVariation * 100)).toString() },
        surcharges: [
          { type: "fuel", amount: { currency: "CAD", value: "125" } },
          { type: "residential", amount: { currency: "CAD", value: "75" } }
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
        total: { currency: "CAD", value: Math.round(1485 + (priceVariation * 250)).toString() },
        base: { currency: "CAD", value: Math.round(1200 + (priceVariation * 200)).toString() },
        surcharges: [
          { type: "fuel", amount: { currency: "CAD", value: "180" } },
          { type: "residential", amount: { currency: "CAD", value: "105" } }
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
        total: { currency: "CAD", value: Math.round(10500 + (priceVariation * 1000)).toString() },
        base: { currency: "CAD", value: Math.round(8500 + (priceVariation * 800)).toString() },
        surcharges: [
          { type: "fuel", amount: { currency: "CAD", value: "1275" } },
          { type: "residential_delivery", amount: { currency: "CAD", value: "500" } },
          { type: "lift_gate", amount: { currency: "CAD", value: "225" } }
        ],
        taxes: [],
        transit_time_days: 5,
        transit_time_not_available: false
      },
      {
        carrier_name: "Purolator Freight",
        service_name: "LTL",
        service_id: "PUR_LTL",
        valid_until: { year: 2025, month: 12, day: 31 },
        total: { currency: "CAD", value: Math.round(12200 + (priceVariation * 800)).toString() }, // Consistent around $122
        base: { currency: "CAD", value: Math.round(9800 + (priceVariation * 600)).toString() },
        surcharges: [
          { type: "fuel", amount: { currency: "CAD", value: "1470" } },
          { type: "residential_delivery", amount: { currency: "CAD", value: "650" } },
          { type: "lift_gate", amount: { currency: "CAD", value: "280" } }
        ],
        taxes: [],
        transit_time_days: 3,
        transit_time_not_available: false
      },
      {
        carrier_name: "Day & Ross",
        service_name: "LTL Express",
        service_id: "DR_LTL_EXP",
        valid_until: { year: 2025, month: 12, day: 31 },
        total: { currency: "CAD", value: Math.round(15500 + (priceVariation * 1200)).toString() },
        base: { currency: "CAD", value: Math.round(12500 + (priceVariation * 1000)).toString() },
        surcharges: [
          { type: "fuel", amount: { currency: "CAD", value: "1875" } },
          { type: "residential_delivery", amount: { currency: "CAD", value: "750" } },
          { type: "lift_gate", amount: { currency: "CAD", value: "250" } },
          { type: "express", amount: { currency: "CAD", value: "125" } }
        ],
        taxes: [],
        transit_time_days: 2,
        transit_time_not_available: false
      }
    ]
  };

  return baseRates[packagingType] || baseRates.package;
}

// Rate request endpoint
app.post('/rate', (req, res) => {
  const requestId = uuidv4();
  const { services, excluded_services, details } = req.body;
  
  console.log('📦 Rate request for packaging type:', details.packaging_type);
  console.log('🏠 Destination:', details.destination.city, details.destination.zip);
  
  // Store the request for polling
  rateRequests.set(requestId, {
    id: requestId,
    request: req.body,
    status: 'processing',
    created: Date.now()
  });
  
  // Generate consistent rates
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
    
    console.log(`✅ Generated ${filteredRates.length} CONSISTENT rates for ${details.destination.city}`);
    filteredRates.forEach(rate => {
      const price = (parseInt(rate.total.value) / 100).toFixed(2);
      console.log(`  ${rate.carrier_name} ${rate.service_name}: $${price}`);
    });
  }, 800); // Shorter delay for better UX
  
  res.status(202).json({
    request_id: requestId
  });
});

// Rate polling endpoint  
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
  
  console.log(`📋 Returning ${rateRequest.rates.length} completed rates`);
  
  res.status(200).json({
    status: {
      done: true,
      total: rateRequest.rates.length,
      complete: rateRequest.rates.length
    },
    rates: rateRequest.rates
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '2.5.3-consistent',
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Freightcom Mock API Server - Designer Deck',
    version: '2.5.3-consistent',
    description: 'Mock API with CONSISTENT pricing per address',
    improvements: [
      'Fixed random pricing variations',
      'Consistent rates per destination',
      'Better logging for debugging',
      'Shorter response times'
    ]
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ 
    message: 'Shipping rate calculation temporarily unavailable',
    error: 'Please try again or contact support'
  });
});

// 404 handler
app.use((req, res) => {
  console.log(`❓ 404 - Endpoint not found: ${req.method} ${req.path}`);
  res.status(404).json({ 
    message: 'Endpoint not found',
    available_endpoints: ['GET /', 'GET /health', 'POST /rate', 'GET /rate/{id}']
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('\n🚀 Freightcom Mock API Server v2.5.3-consistent');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log('\n🎯 Fixed Issues:');
  console.log('  ✅ Consistent pricing per destination');
  console.log('  ✅ No random price variations');
  console.log('  ✅ Better debugging logs');
  console.log('  ✅ Faster response times');
});

module.exports = app;
