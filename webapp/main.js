import { readBarcodesFromImageData } from 'zxing-wasm';

const LOCAL_DB = {
    "24187": "Migros Karotten"
};

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
const API_CACHE = {}; 

// Create a fast, hidden canvas for preprocessing frames
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
let stream = null;

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
        statusMsg.textContent = "Booting C++ hardware engine...";

        stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: "environment",
                width: { ideal: 640 },
                height: { ideal: 480 },
                advanced: [{ focusMode: "continuous" }]
            }
        });
        
        videoElement.srcObject = stream;
        statusMsg.textContent = "Processing frames...";

        // Begin the scanning loop once video is actually playing
        videoElement.onplay = () => {
            scanLoop();
        };

    } catch (err) {
        console.error(err);
        statusMsg.textContent = "Error accessing camera.";
    }
}

function stopScanner() {
    isScanning = false;
    scanBtn.textContent = "Start Scanner";
    videoWrapper.classList.remove('active');
    statusMsg.textContent = "";
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        stream = null;
    }
}

async function scanLoop() {
    if (!isScanning) return;

    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        
        // Draw the frame
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // Get raw pixel data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Perform grayscale & contrast thresholding manually for the user
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            // Standard luminance weighting to grayscale
            const gray = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
            // Boost contrast natively for the C++ engine!
            const contrast = gray > 110 ? 255 : 0; 
            data[i] = data[i+1] = data[i+2] = contrast;
        }
        
        try {
            // Pass the preprocessed black & white frame to the ZXing WebAssembly C++ Engine!
            const results = await readBarcodesFromImageData(imageData, {
                tryHarder: true, // We can afford this now because C++ WASM is lightning fast
                formats: ["Aztec", "EAN-13", "EAN-8", "QRCode", "DataMatrix"]
            });

            if (results && results.length > 0) {
                const text = results[0].text;
                const now = Date.now();
                if (text !== lastScannedCode || (now - lastScannedTime) > 3000) {
                    lastScannedCode = text;
                    lastScannedTime = now;
                    handleResult(text);
                }
            }
        } catch (e) {
            // No barcode found this frame, completely ignore.
        }
    }
    
    // Throttle to 150ms to keep UI super smooth and not drain phone battery
    setTimeout(scanLoop, 150);
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

    // Check Memory Cache!
    if (API_CACHE[barcode]) {
        displayApiResult(API_CACHE[barcode]);
        return;
    }

    // Call OpenFoodFacts API directly with targeted ?fields to reduce payload size from Megabytes to Kilobytes!
    displayLoading();
    try {
        const fields = 'product_name,brands,nutriscore_grade,ecoscore_grade,quantity,image_front_url,categories,ingredients_text,allergens';
        const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=${fields}`);
        if (!res.ok) throw new Error("Product API rate limited or unavailable.");
        
        const data = await res.json();
        if (data.status === 1 && data.product) {
            API_CACHE[barcode] = data.product; // Save to cache
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
