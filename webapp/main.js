import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';

const LOCAL_DB = {
    "24187": "Migros Karotten"
};

const hints = new Map();
hints.set(DecodeHintType.TRY_HARDER, true);

const formats = [
    BarcodeFormat.AZTEC,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39
];
hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);

const codeReader = new BrowserMultiFormatReader(hints);

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

const processCanvas = document.createElement("canvas");
const pctx = processCanvas.getContext("2d", { willReadFrequently: true });
processCanvas.width = 480; 
processCanvas.height = 480;

const overlayCanvas = document.createElement("canvas");
overlayCanvas.style.position = 'absolute';
overlayCanvas.style.top = '0';
overlayCanvas.style.left = '0';
overlayCanvas.style.width = '100%';
overlayCanvas.style.height = '100%';
overlayCanvas.style.pointerEvents = 'none';
overlayCanvas.style.zIndex = '10';
videoWrapper.appendChild(overlayCanvas);
const octx = overlayCanvas.getContext("2d");

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
        statusMsg.textContent = "Requesting iPhone camera...";

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
        statusMsg.textContent = "Processing frames instantly...";

        videoElement.onplay = () => {
            overlayCanvas.width = videoElement.clientWidth;
            overlayCanvas.height = videoElement.clientHeight;
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
    octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

function drawGreenRim(result) {
    const points = result.getResultPoints();
    if (points && points.length > 0) {
        octx.clearRect(0,0, overlayCanvas.width, overlayCanvas.height);
        
        const scaleX = overlayCanvas.width / processCanvas.width;
        const scaleY = overlayCanvas.height / processCanvas.height;
        
        octx.beginPath();
        octx.strokeStyle = "#39ff14"; 
        octx.lineWidth = 5;
        octx.moveTo(points[0].getX() * scaleX, points[0].getY() * scaleY);
        
        for (let i = 1; i < points.length; i++) {
            octx.lineTo(points[i].getX() * scaleX, points[i].getY() * scaleY);
        }
        
        if (points.length > 2) {
            octx.closePath();
        }
        octx.stroke();
        
        setTimeout(() => {
            if (isScanning) octx.clearRect(0,0, overlayCanvas.width, overlayCanvas.height);
        }, 800);
    }
}

async function scanLoop() {
    if (!isScanning) return;

    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        pctx.drawImage(videoElement, 0, 0, processCanvas.width, processCanvas.height);
        
        try {
            const result = codeReader.decodeFromCanvas(processCanvas);

            if (result) {
                drawGreenRim(result); 
                
                const text = result.getText();
                const now = Date.now();
                if (text !== lastScannedCode || (now - lastScannedTime) > 3000) {
                    lastScannedCode = text;
                    lastScannedTime = now;
                    handleResult(text);
                }
            }
        } catch (e) {
            // No barcode found
        }
    }
    
    setTimeout(scanLoop, 150);
}

async function handleResult(barcode) {
    statusMsg.textContent = `Scanned: ${barcode}`;

    if (barcode.length === 13 && barcode.startsWith("2")) {
        const itemCode = barcode.substring(2, 7);
        const valStr = barcode.substring(7, 12);
        const price = (parseInt(valStr, 10) / 100).toFixed(2);
        const name = LOCAL_DB[itemCode] || `Local Item ${itemCode}`;
        displayLocalResult(name, price);
        return;
    }

    if (API_CACHE[barcode]) {
        displayApiResult(API_CACHE[barcode]);
        return;
    }

    displayLoading();
    try {
        const fields = 'product_name,brands,nutriscore_grade,ecoscore_grade,quantity,image_front_url,categories,ingredients_text,allergens';
        const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=${fields}`);
        if (!res.ok) throw new Error("Product API rate limited or unavailable.");
        
        const data = await res.json();
        if (data.status === 1 && data.product) {
            API_CACHE[barcode] = data.product; 
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
