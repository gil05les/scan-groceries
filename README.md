# Fridge Scanner (Web App & Python)

A dual-architecture barcode and receipt scanner that instantly identifies groceries. It handles both standard 1D commercial barcodes (via OpenFoodFacts) and 2D local store-generated Aztec codes (like those from Migros or Coop scales).

## 1. The Web App (Live on GitHub Pages)
A lightning-fast, zero-backend, pure JavaScript web application utilizing a beautiful Glassmorphism UI. It runs entirely in your browser using `@zxing/browser` for instant native camera scanning.

### How to run locally:
```bash
cd webapp
npm install
npm run dev
```

### GitHub Pages Setup:
This repository is configured to **automatically** deploy the web app to GitHub Pages whenever you push to `main` via GitHub Actions limitlessly!

**To enable the live deployment on GitHub:**
1. Go to your repository **Settings** on GitHub.
2. Click on **Pages** in the left sidebar.
3. Under **Build and deployment**, change the **Source** dropdown to **GitHub Actions**.

Once GitHub finishes its first automated build (usually within 60 seconds), the web app will be fully public and accessible at: 
**`https://<your-username>.github.io/scan-groceries/`**

## 2. The Python Backend (For local development)
The original Python script allows for desktop execution of the identical scanning engine using OpenCV.

### Installation:
```bash
# macOS
brew install zbar

# Python Dependencies
python3 -m pip install opencv-python pyzbar zxing-cpp openfoodfacts requests --break-system-packages
```

### Usage:
```bash
python3 scan.py
```
