var mongoose = require('mongoose');

var productSchema = mongoose.Schema({
    productName: String,
    productDescription: String,
    category: String,
    productHistory: [{
        url: String,
        vendor: String,
        prices: [{
            date: Date,
            price: Number,
            currency: String
        }],
        specs: [{
            name: String,
            value: String
        }],
        status: Number
    }]
});

module.exports = mongoose.model('product', productSchema);