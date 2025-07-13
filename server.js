// server.js - Weight-Based Pricing Mock API for Freightcom
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

// ENHANCED: Weight-based rate calculation
function calculateWeightBasedRates(packagingType, origin, destination, packagingProperties) {
  console.log('🔍 Calculating weight-based rates...');
  
  // Extract total weight and dimensions from packaging properties
  const shipmentData = analyzeShipmentData(packagingProperties, packagingType);
  console.log('📊 Shipment Analysis:', shipmentData);
  
  // Calculate distance factor (Ottawa to various Canadian cities)
  const distanceFactor = calculateDistanceFactor(origin, destination);
  
  if (packagingType === 'package') {
    return generateParcelRates(shipmentData, distanceFactor, destination);
  } else {
    return generateLTLRates(shipmentData, distanceFactor, destination);
  }
}

// Analyze shipment data from packaging properties
function analyzeShipmentData(packagingProperties, packagingType) {
  let totalWeight = 0;
  let totalVolume = 0; // cubic feet
  let itemCount = 0;
  let maxDimension = 0;
  
  if (packagingType === 'package' && packagingProperties.packages) {
    packagingProperties.packages.forEach(pkg => {
      const weight = pkg.measurements?.weight?.value || 1;
      const cuboid = pkg.measurements?.cuboid || {};
      
      totalWeight += weight;
      itemCount++;
      
      // Convert dimensions to feet for volume calculation
      let l = cuboid.l || 12;
      let w = cuboid.w || 8;
      let h = cuboid.h || 6;
      
      if (cuboid.unit === 'in') {
        l /= 12; w /= 12; h /= 12;
      }
      
      const volume = l * w * h;
      totalVolume += volume;
      maxDimension = Math.max(maxDimension, l, w, h);
    });
  } else if (packagingType === 'pallet' && packagingProperties.pallets) {
    packagingProperties.pallets.forEach(pallet => {
      const weight = pallet.measurements?.weight?.value || 50;
      const cuboid = pallet.measurements?.cuboid || {};
      
      totalWeight += weight;
      itemCount++;
      
      // Pallet dimensions are typically in feet
      const l = cuboid.l || 4;
      const w = cuboid.w || 4;
      const h = cuboid.h || 4;
      
      const volume = l * w * h;
      totalVolume += volume;
      maxDimension = Math.max(maxDimension, l, w, h);
    });
  }
  
  // Calculate dimensional weight (for packages)
  const dimensionalWeight = packagingType === 'package' 
    ? (totalVolume * 166) // 166 lbs per cubic foot (industry standard)
    : totalWeight; // LTL uses actual weight
  
  // Billable weight is higher of actual vs dimensional
  const billableWeight = Math.max(totalWeight, dimensionalWeight);
  
  return {
    actualWeight: totalWeight,
    dimensionalWeight: dimensionalWeight,
    billableWeight: billableWeight,
    totalVolume: totalVolume,
    itemCount: itemCount,
    maxDimension: maxDimension,
    density: totalWeight / totalVolume // lbs per cubic foot
  };
}

// Calculate distance factor based on destination
function calculateDistanceFactor(origin, destination) {
  const destCity = destination.city?.toLowerCase() || '';
  const destProvince = destination.region?.toLowerCase() || '';
  
  // Distance multipliers based on Canadian geography from Ottawa
  const distanceFactors = {
    // Ontario
    'toronto': 1.0, 'mississauga': 1.0, 'hamilton': 1.1,
    'london': 1.2, 'kitchener': 1.1, 'windsor': 1.4,
    
    // Quebec  
    'montreal': 0.8, 'quebec': 1.1, 'laval': 0.8,
    
    // Maritime
    'halifax': 1.8, 'moncton': 1.6, 'fredericton': 1.5,
    'charlottetown': 1.9, "st. john's": 2.2,
    
    // Western Canada
    'winnipeg': 2.1, 'regina': 2.3, 'saskatoon': 2.4,
    'calgary': 2.6, 'edmonton': 2.7, 'vancouver': 3.0,
    'victoria': 3.2,
    
    // Territories
    'yellowknife': 4.0, 'whitehorse': 4.5, 'iqaluit': 5.0
  };
  
  let factor = distanceFactors[destCity] || 1.5; // Default for unknown cities
  
  // Province-based fallbacks
  if (!distanceFactors[destCity]) {
    const provinceFactors = {
      'on': 1.2, 'qc': 1.0, 'bc': 3.0, 'ab': 2.6, 'sk': 2.3, 'mb': 2.1,
      'ns': 1.8, 'nb': 1.6, 'pe': 1.9, 'nl': 2.2, 'nt': 4.0, 'nu': 5.0, 'yt': 4.5
    };
    factor = provinceFactors[destProvince] || 1.5;
  }
  
  console.log(`📍 Distance factor for ${destCity}, ${destProvince}: ${factor}x`);
  return factor;
}

// Generate parcel shipping rates
function generateParcelRates(shipmentData, distanceFactor, destination) {
  const isResidential = destination.residential;
  const residentialSurcharge = isResidential ? 1.15 : 1.0;
  
  // Base rates per pound (CAD cents)
  const baseRatesPerLb = {
    cp_expedited: 85,  // Canada Post Expedited
    cp_regular: 65,    // Canada Post Regular  
    pur_ground: 95     // Purolator Ground
  };
  
  const rates = [];
  
  Object.entries(baseRatesPerLb).forEach(([serviceId, baseRate]) => {
    // Calculate base cost: (weight × rate per lb) + handling fee
    const weightCost = Math.round(shipmentData.billableWeight * baseRate);
    const handlingFee = shipmentData.itemCount * 150; // $1.50 per package
    const baseCost = weightCost + handlingFee;
    
    // Apply distance and residential multipliers
    const adjustedCost = Math.round(baseCost * distanceFactor * residentialSurcharge);
    
    // Calculate surcharges
    const fuelSurcharge = Math.round(adjustedCost * 0.15); // 15% fuel
    const residentialFee = isResidential ? 130 : 0; // $1.30 residential fee
    
    // Dimensional weight surcharge for large, light packages
    const dimWeightSurcharge = shipmentData.dimensionalWeight > shipmentData.actualWeight ? 
      Math.round((shipmentData.dimensionalWeight - shipmentData.actualWeight) * 25) : 0;
    
    const totalCost = adjustedCost + fuelSurcharge + residentialFee + dimWeightSurcharge;
    
    const carrierInfo = getCarrierInfo(serviceId);
    
    rates.push({
      carrier_name: carrierInfo.carrier,
      service_name: carrierInfo.service,
      service_id: serviceId.toUpperCase(),
      valid_until: { year: 2025, month: 12, day: 31 },
      total: { currency: "CAD", value: totalCost.toString() },
      base: { currency: "CAD", value: adjustedCost.toString() },
      surcharges: [
        { type: "fuel", amount: { currency: "CAD", value: fuelSurcharge.toString() } },
        ...(isResidential ? [{ type: "residential", amount: { currency: "CAD", value: residentialFee.toString() } }] : []),
        ...(dimWeightSurcharge > 0 ? [{ type: "dimensional_weight", amount: { currency: "CAD", value: dimWeightSurcharge.toString() } }] : [])
      ],
      taxes: [],
      transit_time_days: carrierInfo.transitDays,
      transit_time_not_available: false
    });
    
    console.log(`📦 ${carrierInfo.carrier} ${carrierInfo.service}: Weight ${shipmentData.billableWeight}lbs → $${(totalCost/100).toFixed(2)}`);
  });
  
  return rates.sort((a, b) => parseInt(a.total.value) - parseInt(b.total.value));
}

// Generate LTL shipping rates  
function generateLTLRates(shipmentData, distanceFactor, destination) {
  const isResidential = destination.residential;
  
  // Determine freight class based on density
  const freightClass = calculateFreightClass(shipmentData.density);
  
  // Base rates per 100 lbs by freight class (CAD cents)
  const baseRatesPer100Lbs = {
    dr_ltl_std: getFreightClassRate(freightClass, 'standard'),
    dr_ltl_exp: getFreightClassRate(freightClass, 'express'), 
    pur_ltl: getFreightClassRate(freightClass, 'premium')
  };
  
  const rates = [];
  
  Object.entries(baseRatesPer100Lbs).forEach(([serviceId, baseRate]) => {
    // Calculate base cost: (weight ÷ 100) × rate per 100lbs
    const weightUnits = Math.max(1, Math.ceil(shipmentData.actualWeight / 100));
    const baseCost = Math.round(weightUnits * baseRate);
    
    // Apply distance multiplier
    const adjustedCost = Math.round(baseCost * distanceFactor);
    
    // Calculate LTL surcharges
    const fuelSurcharge = Math.round(adjustedCost * 0.18); // 18% fuel for LTL
    const residentialFee = isResidential ? 750 : 0; // $7.50 residential delivery
    const liftGateFee = 250; // $2.50 lift gate (common for building materials)
    
    // Minimum charge for LTL
    const minimumCharge = 5000; // $50 minimum
    const totalBeforeMin = adjustedCost + fuelSurcharge + residentialFee + liftGateFee;
    const totalCost = Math.max(minimumCharge, totalBeforeMin);
    
    const carrierInfo = getCarrierInfo(serviceId);
    
    rates.push({
      carrier_name: carrierInfo.carrier,
      service_name: carrierInfo.service,
      service_id: serviceId.toUpperCase(),
      valid_until: { year: 2025, month: 12, day: 31 },
      total: { currency: "CAD", value: totalCost.toString() },
      base: { currency: "CAD", value: adjustedCost.toString() },
      surcharges: [
        { type: "fuel", amount: { currency: "CAD", value: fuelSurcharge.toString() } },
        { type: "lift_gate", amount: { currency: "CAD", value: liftGateFee.toString() } },
        ...(isResidential ? [{ type: "residential_delivery", amount: { currency: "CAD", value: residentialFee.toString() } }] : [])
      ],
      taxes: [],
      transit_time_days: carrierInfo.transitDays,
      transit_time_not_available: false
    });
    
    console.log(`🚛 ${carrierInfo.carrier} ${carrierInfo.service}: ${shipmentData.actualWeight}lbs, Class ${freightClass} → $${(totalCost/100).toFixed(2)}`);
  });
  
  return rates.sort((a, b) => parseInt(a.total.value) - parseInt(b.total.value));
}

// Calculate freight class based on density (lbs per cubic foot)
function calculateFreightClass(density) {
  if (density >= 50) return '50';   // Very dense
  if (density >= 35) return '55';   
  if (density >= 30) return '60';
  if (density >= 22.5) return '65';
  if (density >= 15) return '70';
  if (density >= 13.5) return '77.5';
  if (density >= 12) return '85';
  if (density >= 10.5) return '92.5';
  if (density >= 9) return '100';
  if (density >= 8) return '110';
  if (density >= 7) return '125';    // Common for building materials
  if (density >= 6) return '150';
  if (density >= 5) return '175';
  if (density >= 4) return '200';
  if (density >= 3) return '250';
  if (density >= 2) return '300';
  if (density >= 1) return '400';
  return '500'; // Very light/bulky items
}

// Get freight class rate (cents per 100 lbs)
function getFreightClassRate(freightClass, serviceType) {
  const baseRates = {
    '50': { standard: 2500, express: 3500, premium: 3000 },
    '55': { standard: 2800, express: 3900, premium: 3300 },
    '60': { standard: 3100, express: 4300, premium: 3600 },
    '65': { standard: 3400, express: 4700, premium: 3900 },
    '70': { standard: 3700, express: 5100, premium: 4200 },
    '77.5': { standard: 4000, express: 5500, premium: 4500 },
    '85': { standard: 4300, express: 5900, premium: 4800 },
    '92.5': { standard: 4600, express: 6300, premium: 5100 },
    '100': { standard: 4900, express: 6700, premium: 5400 },
    '110': { standard: 5200, express: 7100, premium: 5700 },
    '125': { standard: 5500, express: 7500, premium: 6000 }, // Building materials
    '150': { standard: 5800, express: 7900, premium: 6300 },
    '175': { standard: 6100, express: 8300, premium: 6600 },
    '200': { standard: 6400, express: 8700, premium: 6900 },
    '250': { standard: 6700, express: 9100, premium: 7200 },
    '300': { standard: 7000, express: 9500, premium: 7500 },
    '400': { standard: 7300, express: 9900, premium: 7800 },
    '500': { standard: 7600, express: 10300, premium: 8100 }
  };
  
  return baseRates[freightClass]?.[serviceType] || 5500;
}

// Get carrier information
function getCarrierInfo(serviceId) {
  const carriers = {
    cp_expedited: { carrier: 'Canada Post', service: 'Expedited Parcel', transitDays: 3 },
    cp_regular: { carrier: 'Canada Post', service: 'Regular Parcel', transitDays: 5 },
    pur_ground: { carrier: 'Purolator', service: 'Ground', transitDays: 2 },
    dr_ltl_std: { carrier: 'Day & Ross', service: 'LTL Standard', transitDays: 5 },
    dr_ltl_exp: { carrier: 'Day & Ross', service: 'LTL Express', transitDays: 2 },
    pur_ltl: { carrier: 'Purolator Freight', service: 'LTL', transitDays: 3 }
  };
  
  return carriers[serviceId] || { carrier: 'Unknown', service: 'Standard', transitDays: 5 };
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
  
  // Generate weight-based rates
  setTimeout(() => {
    const rates = calculateWeightBasedRates(
      details.packaging_type,
      details.origin,
      details.destination,
      details.packaging_properties
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
    
    console.log(`✅ Generated ${filteredRates.length} WEIGHT-BASED rates for ${details.destination.city}`);
  }, 800);
  
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
  
  console.log(`📋 Returning ${rateRequest.rates.length} weight-based rates`);
  
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
    version: '3.0.0-weight-based',
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Freightcom Mock API Server - Designer Deck',
    version: '3.0.0-weight-based',
    description: 'Weight-based pricing that matches real Freightcom API patterns',
    features: [
      'Weight-based rate calculation',
      'Dimensional weight for packages',
      'Freight class calculation for LTL',
      'Distance-based pricing',
      'Residential vs commercial rates',
      'Realistic Canadian carrier pricing'
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
  console.log('\n🚀 Freightcom Mock API Server v3.0.0 - Weight-Based Pricing');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log('\n🎯 New Weight-Based Features:');
  console.log('  ⚖️  Actual product weight calculations');
  console.log('  📏 Dimensional weight for large/light packages');
  console.log('  🚛 Freight class calculation (density-based)');
  console.log('  📍 Distance-based pricing across Canada');
  console.log('  🏠 Residential vs commercial surcharges');
  console.log('  💰 Realistic per-pound and per-100lb pricing');
  console.log('\n📊 Test different product weights to see pricing changes!');
});

module.exports = app;
