import { BrowserMultiFormatReader } from '@zxing/browser';

const LOCAL_DB = {
    "24187": "Migros Karotten"
};

const codeReader = new BrowserMultiFormatReader();
const scanBtn = document.getElementById('scan-btn');
const videoWrapper = document.getElementById('video-wrapper');
const videoElement = document.getElementById('video-preview');
const statusMsg = document.getElementById('status-msg');

const resultCard = document.getElementById('result-card');
const brandEl = document.getElementById('brand');
const nameEl = document.getElementById('product-name');
const imgEl = document.getElementById('product-img');
const loaderEl = document.getElementById('img-loader');
const nutriscoreEl = document.getElementById('nutriscore');
const ecoscoreEl = document.getElementById('ecoscore');
const quantityEl = document.getElementById('quantity');
const detailsListEl = document.getElementById('product-details');

let isScanning = false;
let lastScannedCode = "";
let lastScannedTime = 0;

scanBtn.addEventListener('click', async () => {
    if (isScanning) {
        stopScanner();
    } else {
        await startScanner();
    }
});

async function startScanner() {
    try {
        isScanning = true;
        scanBtn.textContent = "Stop Scanner";
        videoWrapper.classList.add('active');
        // We do NOT hide the result card when starting the scanner, so you can see past results!
        statusMsg.textContent = "Looking for barcodes or Aztec codes...";

        const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();
        // Typically the back camera on mobile or default on desktop
        const selectedDeviceId = videoInputDevices.length > 0 ? videoInputDevices[0].deviceId : undefined;

        codeReader.decodeFromVideoDevice(selectedDeviceId, videoElement, (result, err) => {
            if (result) {
                const text = result.getText();
                const now = Date.now();
                // Prevent API spam: only scan if it's a new code OR 3 seconds have passed
                if (text !== lastScannedCode || (now - lastScannedTime) > 3000) {
                    lastScannedCode = text;
                    lastScannedTime = now;
                    handleResult(text);
                }
            }
        });
    } catch (err) {
        console.error(err);
        statusMsg.textContent = "Error accessing camera.";
    }
}

function stopScanner() {
    isScanning = false;
    codeReader.reset();
    scanBtn.textContent = "Start Scanner";
    videoWrapper.classList.remove('active');
    statusMsg.textContent = "";
}

async function handleResult(barcode) {
    statusMsg.textContent = `Scanned: ${barcode}`;
    // Notice: We removed stopScanner() here! The camera will stay on seamlessly.

    // Check Local DB (e.g., Migros weighing scales)
    if (barcode.length === 13 && barcode.startsWith("2")) {
        const itemCode = barcode.substring(2, 7);
        const valStr = barcode.substring(7, 12);
        const price = (parseInt(valStr, 10) / 100).toFixed(2);
        const name = LOCAL_DB[itemCode] || `Local Item ${itemCode}`;

        displayLocalResult(name, price);
        return;
    }

    // Call OpenFoodFacts API directly from the browser!
    displayLoading();
    try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}`);
        if (!res.ok) throw new Error("Product API rate limited or unavailable.");

        const data = await res.json();
        if (data.status === 1 && data.product) {
            displayApiResult(data.product);
        } else {
            throw new Error("Product not found in international database.");
        }
    } catch (err) {
        displayError(err.message);
    }
}

function displayLocalResult(name, price) {
    brandEl.textContent = "Local Store System";
    nameEl.textContent = name;
    imgEl.src = "";
    imgEl.style.display = 'none';
    loaderEl.style.display = 'none';

    nutriscoreEl.textContent = "N/A";
    ecoscoreEl.textContent = "N/A";
    quantityEl.textContent = `${price} CHF`;

    detailsListEl.innerHTML = `<li><strong>Determined Price:</strong> ${price} CHF</li>`;
    resultCard.classList.remove('hidden');
}

function displayApiResult(product) {
    brandEl.textContent = product.brands || "Unknown Brand";
    nameEl.textContent = product.product_name || "Unknown Product";

    nutriscoreEl.textContent = `Nutri-Score: ${(product.nutriscore_grade || 'N/A').toUpperCase()}`;
    ecoscoreEl.textContent = `Eco-Score: ${(product.ecoscore_grade || 'N/A').toUpperCase()}`;
    quantityEl.textContent = product.quantity || "N/A Qty";

    // Handle high quality product images
    if (product.image_front_url) {
        imgEl.style.display = 'block';
        loaderEl.style.display = 'block';
        imgEl.src = product.image_front_url;
        imgEl.onload = () => loaderEl.style.display = 'none';
        imgEl.onerror = () => { imgEl.style.display = 'none'; loaderEl.style.display = 'none'; };
    } else {
        imgEl.style.display = 'none';
    }

    const fields = [
        { label: "Categories", value: product.categories },
        { label: "Ingredients", value: product.ingredients_text },
        { label: "Allergens", value: product.allergens },
    ];

    detailsListEl.innerHTML = fields
        .filter(f => f.value)
        .map(f => `<li><strong>${f.label}:</strong> ${f.value}</li>`)
        .join('');

    resultCard.classList.remove('hidden');
}

function displayLoading() {
    brandEl.textContent = "Please wait...";
    nameEl.textContent = "Fetching data...";
    imgEl.style.display = 'none';
    loaderEl.style.display = 'block';
    detailsListEl.innerHTML = "";
    resultCard.classList.remove('hidden');
}

function displayError(msg) {
    brandEl.textContent = "Error";
    nameEl.textContent = msg;
    imgEl.style.display = 'none';
    loaderEl.style.display = 'none';
    detailsListEl.innerHTML = "";
    resultCard.classList.remove('hidden');
}
