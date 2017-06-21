var express         = require('express');
var fs              = require('fs');
var request         = require('request');
var cheerio         = require('cheerio');
var mongoose        = require('mongoose');
var chalk           = require('chalk');
var _               = require('lodash');
var sleep           = require('sleep');

var productModel    = require('./product-model');

var app = express();
mongoose.connect('mongodb://localhost:27017/webScraper');

app.get("/test", function(req, res){
    updateExistingEmag("http://www.emag.ro/ultrabook-dell-xps-9360-cu-procesor-intelr-coretm-i5-7200u-2-50-ghz-kaby-laketm-13-3-full-hd-infinityedge-8gb-256gb-ssd-intelr-hd-graphics-620-microsoft-windows-10-pro-silver-dxps9360fi5825sw10/pd/D4MQ47BBM/");
});

app.get('/scrape', function(req, res){
    scrapeEmag(20);
    res.send("OK");
});

app.get("/update", function(req, res){
    updateExisting();
    res.send("OK");
})

app.get("/update/:category", function(req, res){
    updateExisting(req.category);
    res.send("OK");
});

function updateExisting(category){
    //get products from category
    //foreach product get vendor
    //call method according to vendor
    productModel.find().stream().on("data", function(item){
        var history = item.productHistory;
        for(var i = 0; i < history.length; i++){
            switch(history[i].vendor){
                case "eMag":
                    updateExistingEmag(history[i].url);
                    break;
            }
        }
    });
}

function scrapeEmag(numberOfPages){
    rootUrl = "http://www.emag.ro";
    categories = [{
        name: "Laptop",
        urlSuffix: "laptopuri",
        keywords: [
            "Ultrabook(.*?)cu proce",
            "Laptop 2-in-1(.*?)cu proce",
            "Laptop 2-in-1(.*?), ",
            "2 in 1(.*?)with proce",
            "Laptop 2 in 1(.*?)cu proce",
            "2 in 1 (.*?) cu",
            "Laptop Gaming(.*?)cu proce",
            "Laptop (.*?)cu proce",
            "Laptop (.*?) proce",
            "Laptop (.*?), ecran",
            "Laptop (.*?), FHD",
            "Laptop (.*?), HD",
            "Laptop (.*?), ",
            "Ultrabook (.*?), ",
            "(.*?) cu proce",
            "(.*?), "
        ]
    },{
        name: "Motherboards",
        urlSuffix: "placi_baza",
        keywords:[
            "Placa de baza (.*?),"
        ]
    },{
        name: "GPU",
        urlSuffix: "placi_video",
        keywords:[
            "Placa video (.*?),",
            "Video card (.*?),",
            "Placa video (.*?)"
        ]
    },{
        name: "CPU",
        urlSuffix: "procesoare",
        keywords:[
            "Procesor (.*?),"
        ]
    },{
        name: "SSD",
        urlSuffix: "solid-state_drive_ssd_",
        keywords:[
            "Solid State Drive (SSD) (.*?)"
        ]
    }];
    pageTemplate = "p{0}/c";

    for(var i = 0; i<categories.length; i++){
        category = categories[i].urlSuffix;
        keywords = categories[i].keywords;
        catName = categories[i].name;

        getPages(category, keywords, catName);

        function getPages(category, keywords, catName){ 
            for(var j = 1; j<=numberOfPages; j++){
                page = pageTemplate.replace("{0}", j.toString());
                url = rootUrl + "/" + category + "/" + page;
                getPage(category, keywords, catName, url);

                function getPage(category, keywords, catName, url){
                    request(url, function(error, response, html){
                        if(!error){
                            sleep.sleep(2);
                            console.log(chalk.dim("Got page from url: " + url));
                            var $ = cheerio.load(html);
                            $(".product-holder-grid").filter(function (){
                                if($(this).find(".middle-container a")[0]){
                                    var description = $(this).find(".middle-container a")[0].children[0].data.trim();
                                    var productName;
                                    var keyword;
                                    for(var k = 0; k<keywords.length || productName; k++){
                                        if(description.match(new RegExp(keywords[k], "i"))){
                                            productName = description.match(new RegExp(keywords[k], "i"))[1];
                                            keyword = keywords[k];
                                            break;
                                        }
                                    }
                                    if(productName){
                                        productName = productName.trim();
                                        //console.log(chalk.green(productName) + " matched " + chalk.blue(keyword));
                                    }
                                    else {
                                        productName = description;
                                        console.log(chalk.bgRed(description));
                                    }

                                    var productUrl = $(this).find(".middle-container a")[0].attribs["href"];
                                    var fullUrl = rootUrl + productUrl;

                                    findAndUpsert(fullUrl, $);
                                    
                                    function findAndUpsert(fullUrl, $){
                                        productModel.find({"productHistory": {$elemMatch: {"url": fullUrl}}}, function(err, data){
                                            if(err)
                                                chalk.bgRed(console.log(err));
                                            else{
                                                if(data.length == 1){
                                                    upsertProduct(data[0]);
                                                } else if(data.length > 1) {
                                                    chalk.red(console.log("Too many entries for " + fullUrl));
                                                    for(var k = 0; k<data.length; k++){
                                                        upsertProduct(data[k]);
                                                    }
                                                } else {
                                                    var product = new productModel();
                                                    product.productName = productName;
                                                    product.productDescription = description;
                                                    product.productHistory = [];
                                                    product.productHistory.push({
                                                            url: fullUrl,
                                                            vendor: "eMag"});
                                                    if($(this).find(".bottom-container .price-over .money-int").length > 0 
                                                        && $(this).find(".bottom-container .price-over .money-currency")[0]){
                                                        var price = $(this).find(".bottom-container .price-over .money-int")[0].children[0].data.trim().replace(".", "");
                                                        var currency = $(this).find(".bottom-container .price-over .money-currency")[0].children[0].data.trim();
                                                        
                                                        product.productHistory[0].prices.push({
                                                            date: Date.now(),
                                                            price: price,
                                                            currency: currency
                                                        });
                                                    }
                                                    product.category = catName;
                                                    upsertProduct(product);
                                                    product = null;
                                                    $ = null;
                                                }
                                            }
                                        });
                                    }
                                }
                            });
                        }
                        else{
                            console.log(chalk.bgRed(error));
                        }
                    });
                }                
            }
        }
    }
}

function upsertProduct(product){
    //productModel.find({productHistory: { $elemMatch: {prices:{ $elemMatch: {price: {$lt: 6000}}}}}})
    productModel.find({productHistory: {"$elemMatch": {url: product.productHistory[0].url}}}).then(function(items){
        if(items && items.length > 0){
            var filteredData = _.filter(items, function(item){
                return _.some(item.productHistory, {url: product.productHistory[0].url});
            });
            data = filteredData && filteredData.length > 0 ? filteredData[0] : null;
            if(data){
                var vendorProducts = _.filter(data.productHistory, function(item){
                    return item.vendor === product.productHistory[0].vendor;
                });

                if(vendorProducts && vendorProducts.length > 0){
                    vendorProducts[0].prices.push(product.productHistory[0].prices[0]);
                }
                else{
                    if(!data.productHistory)
                        data.productHistory = [];
                    data.productHistory.push(product.productHistory);
                }
                data.save(onSave);
            }
            product.save(onSave);
        }
        else{
            product.save(onSave);
        }
        product = null;
    });

    function onSave(err, item){
        if(err){
            console.log(chalk.red(err));
        }
        else{
            console.log(chalk.bgGreen(item._id));
        }
    }
}

function updateExistingEmag(url){
    request(url, function(error, response, html){
        if(!error){
            sleep.sleep(2);
            console.log(chalk.dim("Got page from url: " + url));
            var $ = cheerio.load(html);

            var discontinued = $(".product-highlight .label-unavailable");

            if(discontinued.length == 0){
                var priceElem = $(".product-highlight .product-new-price")[0];
                var price = priceElem.children[0].data.trim().replace(".", "");
                var currency = priceElem.children[3].children[0].data;
                //var productMod = new productModel();
                
                productModel.findOne({"productHistory": {$elemMatch: {"url": url}}}, function(err, data){
                    var productHistory = _.find(data.productHistory, function(item){
                        return item.url == url;
                    });
                    var specs = $(".gtm_product-page-specs>div>.row>div>div");
                    var specItems = [];
                    for(var i = 0; i < specs.length; i++){
                        var rows = $(specs[i]).find("table>tbody>tr");
                        for(var j = 0; j < rows.length; j++){
                            var paramName = rows[j].children[1].children[0].data;
                            var paramValue = rows[j].children[3].children[0].data;
                            specItems.push({
                                name: paramName,
                                value: paramValue
                            });
                        }                
                    }
                    productHistory.specs = specItems;
                    productHistory.save(onSave);
                    $ = null;

                    function onSave(err){
                        debugger;
                    }
                });
            } else {
                productModel.findOne({productHistory: {$elemMatch: {url: url}}}, function(err, data){
                    var productHistory = _.find(data.productHistory, function(item){
                        return item.url == url;
                    });
                    productHistory.status = 1;
                    productHistory.save();
                    $ = null;
                });
            }
        }
    });
}

app.listen('8081')
console.log('Magic happens on port 8081');
exports = module.exports = app;