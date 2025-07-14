/** @odoo-module **/

import publicWidget from "@web/legacy/js/public/public_widget";

// Freightcom Shipping Rate Widget for Checkout with Logo Support
publicWidget.registry.FreightcomShipping = publicWidget.Widget.extend({
    selector: '.oe_website_sale',
    events: {
        'change input[name="o_delivery_radio"]': '_onDeliveryMethodChange',
        'change .o_delivery_carrier_select': '_onCarrierChange',
    },

    /**
     * @override
     */
    start: function () {
        this._super.apply(this, arguments);
        this._initFreightcomShipping();
        
        // Apply carrier logos after a short delay to ensure DOM is ready
        setTimeout(() => {
            this._applyCarrierLogos();
        }, 500);
    },

    /**
     * Initialize Freightcom shipping functionality with logos
     */
    _initFreightcomShipping: function () {
        console.log('Freightcom Shipping: Initializing with logo support...');
        
        // Add the working logo CSS
        this._addLogoCSS();
        
        // Add loading state handler
        this._setupLoadingStates();
        
        // Initialize rate refresh on address change
        this._setupAddressChangeHandlers();
        
        // Get real packaging info from backend
        this._loadPackagingInfo();
    },

    /**
     * Load real packaging information from backend
     */
    _loadPackagingInfo: function () {
        const self = this;
        
        // Call the backend API to get real packaging info
        this._rpc({
            route: '/shop/get_packaging_info',
            params: {}
        }).then(function(result) {
            console.log('📦 Packaging info from backend:', result);
            
            if (result.success) {
                self.packagingInfo = {
                    type: result.packaging_type,
                    displayName: result.display_name
                };
                console.log(`✅ Real packaging type: ${result.display_name}`);
                
                // Update any existing packaging info displays
                self._updatePackagingInfoDisplay();
            } else {
                console.log('❌ Failed to get packaging info:', result.error);
                // Fallback to default
                self.packagingInfo = {
                    type: 'package',
                    displayName: 'Package'
                };
            }
        }).catch(function(error) {
            console.log('❌ Error getting packaging info:', error);
            // Fallback to default
            self.packagingInfo = {
                type: 'package',
                displayName: 'Package'
            };
        });
    },

    /**
     * Update packaging info displays on the page
     */
    _updatePackagingInfoDisplay: function () {
        const self = this;
        
        // Update any existing packaging info messages
        $('.freightcom-packaging-info').each(function() {
            const $info = $(this);
            $info.html(`
                <strong>📦 Shipping Method:</strong> This order will be automatically classified as 
                <strong>${self.packagingInfo.displayName}</strong> shipping based on your products.
            `);
        });
    },

    /**
     * Add the CSS that makes logos work correctly for Odoo structure
     */
    _addLogoCSS: function () {
        if (!$('#freightcom-logo-fix').length) {
            $('<style id="freightcom-logo-fix">').text(`
                /* Shipping option styling with logos for Odoo structure */
                label.freightcom-rate-option {
                    position: relative !important;
                    padding: 15px 15px 15px 70px !important;
                    border: 1px solid #e0e0e0 !important;
                    border-radius: 8px !important;
                    margin-bottom: 8px !important;
                    background: #fff !important;
                    transition: all 0.3s ease !important;
                    display: block !important;
                    min-height: 60px !important;
                    cursor: pointer !important;
                }

                label.freightcom-rate-option:hover {
                    border-color: #007bff !important;
                    box-shadow: 0 2px 8px rgba(0, 123, 255, 0.1) !important;
                }

                label.freightcom-rate-option.selected {
                    border-color: #007bff !important;
                    background-color: #f8f9ff !important;
                }

                /* Logo positioning */
                label.freightcom-rate-option::before {
                    content: '' !important;
                    position: absolute !important;
                    left: 15px !important;
                    top: 50% !important;
                    transform: translateY(-50%) !important;
                    width: 50px !important;
                    height: 35px !important;
                    background-size: contain !important;
                    background-repeat: no-repeat !important;
                    background-position: center !important;
                    border-radius: 4px !important;
                    background-color: #fff !important;
                    border: 1px solid #f0f0f0 !important;
                    z-index: 1 !important;
                }

                /* Day & Ross Logo */
                label.freightcom-rate-option[data-carrier="day-ross"]::before {
                    background-image: url('/freightcom_shipping/static/src/img/day-ross-logo.png') !important;
                }

                /* Purolator Logo */  
                label.freightcom-rate-option[data-carrier="purolator"]::before {
                    background-image: url('/freightcom_shipping/static/src/img/purolator-logo.png') !important;
                }

                /* Canada Post Logo */
                label.freightcom-rate-option[data-carrier="canada-post"]::before {
                    background-image: url('/freightcom_shipping/static/src/img/canada-post-logo.png') !important;
                }

                /* Standard delivery */
                label.freightcom-rate-option[data-carrier="standard"]::before {
                    background-image: url('/freightcom_shipping/static/src/img/standard-delivery.png') !important;
                }
            `).appendTo('head');
        }
    },

    /**
     * Apply carrier logos to shipping options - targeting correct Odoo structure
     */
    _applyCarrierLogos: function () {
        console.log('🎯 Applying carrier logos to Odoo delivery labels...');
        
        // Target the correct elements: labels with class 'o_delivery_carrier_label'
        $('label.o_delivery_carrier_label').each(function() {
            const $label = $(this);
            const labelText = $label.text().trim();
            
            console.log('Processing shipping label:', labelText);
            
            // Determine carrier type
            let carrierType = 'standard';
            if (labelText.includes('Day & Ross')) {
                carrierType = 'day-ross';
            } else if (labelText.includes('Purolator')) {
                carrierType = 'purolator';
            } else if (labelText.includes('Canada Post')) {
                carrierType = 'canada-post';
            }
            
            // Apply styling to the label
            $label.addClass('freightcom-rate-option');
            $label.attr('data-carrier', carrierType);
            
            console.log(`✅ Applied ${carrierType} to: ${labelText}`);
        });
        
        // Setup selection effects
        this._setupSelectionEffects();
        
        // Check results
        setTimeout(() => {
            const finalCount = $('.freightcom-rate-option').length;
            console.log(`🎉 Final result: ${finalCount} shipping options now have logos!`);
        }, 500);
    },

    /**
     * Setup selection effects for shipping options
     */
    _setupSelectionEffects: function () {
        // Handle radio button changes
        $('input[name="o_delivery_radio"]').on('change', function() {
            // Remove selected class from all labels
            $('.freightcom-rate-option').removeClass('selected');
            
            // Find the associated label and mark it as selected
            const $radio = $(this);
            const $listItem = $radio.closest('li');
            const $label = $listItem.find('label.o_delivery_carrier_label');
            
            if ($label.length) {
                $label.addClass('selected');
            }
        });
        
        // Also handle direct label clicks
        $('.freightcom-rate-option').on('click', function() {
            $('.freightcom-rate-option').removeClass('selected');
            $(this).addClass('selected');
            
            // Trigger the associated radio button
            const $listItem = $(this).closest('li');
            const $radio = $listItem.find('input[name="o_delivery_radio"]');
            if ($radio.length) {
                $radio.prop('checked', true).trigger('change');
            }
        });
    },

    /**
     * Handle delivery method changes
     */
    _onDeliveryMethodChange: function (ev) {
        const selectedCarrier = $(ev.currentTarget);
        const carrierId = selectedCarrier.val();
        
        console.log('Freightcom Shipping: Carrier changed to', carrierId);
        
        // Update selection styling
        this._updateSelectedCarrier(selectedCarrier);
        
        // Show packaging info with real data
        this._showPackagingInfo(selectedCarrier);
        
        // Re-apply logos if needed
        setTimeout(() => {
            this._applyCarrierLogos();
        }, 100);
    },

    /**
     * Handle carrier selection change
     */
    _onCarrierChange: function (ev) {
        console.log('Freightcom Shipping: Carrier selection changed');
        this._refreshShippingRates();
    },

    /**
     * Setup loading states for rate calculation
     */
    _setupLoadingStates: function () {
        // Add loading spinner CSS if not already present
        if (!$('#freightcom-spinner-css').length) {
            $('<style id="freightcom-spinner-css">')
                .text(`
                    .freightcom-loading .spinner { 
                        animation: spin 1s linear infinite; 
                        display: inline-block;
                        width: 20px;
                        height: 20px;
                        border: 3px solid #f3f3f3;
                        border-top: 3px solid #007bff;
                        border-radius: 50%;
                        margin-right: 10px;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `)
                .appendTo('head');
        }
    },

    /**
     * Setup address change handlers
     */
    _setupAddressChangeHandlers: function () {
        const self = this;
        
        // Monitor address form changes
        $(document).on('change', 'input[name="street"], input[name="city"], input[name="zip"], select[name="state_id"], select[name="country_id"]', function() {
            console.log('Freightcom Shipping: Address changed, will refresh rates');
            clearTimeout(self.addressChangeTimeout);
            self.addressChangeTimeout = setTimeout(function() {
                self._refreshShippingRates();
            }, 1000); // Debounce for 1 second
        });
    },

    /**
     * Update selected carrier styling
     */
    _updateSelectedCarrier: function (selectedInput) {
        // Remove previous selection
        $('.freightcom-rate-option').removeClass('selected');
        
        // Find the associated label and mark it as selected
        const $listItem = selectedInput.closest('li');
        const $label = $listItem.find('label.o_delivery_carrier_label');
        
        if ($label.length) {
            $label.addClass('selected');
        }
    },

    /**
     * Show packaging information with real backend data
     */
    _showPackagingInfo: function (carrierInput) {
        const carrierId = carrierInput.val();
        
        // Remove existing packaging info
        $('.freightcom-packaging-info').remove();
        
        // Always show packaging info for shipping selections
        const packagingType = this.packagingInfo ? this.packagingInfo.displayName : 'Package';
        
        const packagingInfo = `
            <div class="freightcom-packaging-info">
                <strong>📦 Shipping Method:</strong> This order will be automatically classified as 
                <strong>${packagingType}</strong> shipping based on your products.
            </div>
        `;
        
        carrierInput.closest('li').after(packagingInfo);
    },

    /**
     * Get packaging type from backend (now actually gets real data)
     */
    _getPackagingType: function () {
        return this.packagingInfo ? this.packagingInfo.displayName : 'Package';
    },

    /**
     * Refresh shipping rates (called on address change)
     */
    _refreshShippingRates: function () {
        console.log('Freightcom Shipping: Refreshing rates...');
        
        const $deliverySection = $('#o_delivery_methods');
        
        // Show loading state
        this._showLoadingState($deliverySection);
        
        // Re-apply logos after refresh
        setTimeout(() => {
            this._hideLoadingState($deliverySection);
            this._applyCarrierLogos();
            this._loadPackagingInfo(); // Reload packaging info too
        }, 2000);
    },

    /**
     * Show loading state
     */
    _showLoadingState: function ($container) {
        if (!$container.find('.freightcom-loading').length) {
            $container.append(`
                <div class="freightcom-loading">
                    <div class="spinner"></div>
                    Calculating shipping rates...
                </div>
            `);
        }
    },

    /**
     * Hide loading state
     */
    _hideLoadingState: function ($container) {
        $container.find('.freightcom-loading').remove();
    },
});

// Initialize when page loads
$(document).ready(function() {
    console.log('Freightcom Shipping: Page ready, initializing with logo support...');
});
