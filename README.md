# Fridge Scanner

A Python-based barcode and receipt scanner that uses a webcam or Apple Continuity Camera to instantly identify groceries. 

It handles both standard 1D commercial barcodes (via OpenFoodFacts) and 2D local store-generated Aztec codes (like those from Migros or Coop scales).

## Prerequisites

### 1. System Dependencies (macOS/Linux)
The `pyzbar` library requires the underlying ZBar C++ library:
```bash
# macOS
brew install zbar

# Ubuntu/Debian
sudo apt-get install libzbar0
```

### 2. Python Dependencies
Install all required Python libraries via `pip`:
```bash
python3 -m pip install opencv-python pyzbar zxing-cpp openfoodfacts requests
```
*(If using Homebrew Python outside a virtual environment on macOS, append `--break-system-packages`)*

## Usage
Simply run the script:
```bash
python3 scan.py
```
Hold a commercial barcode or store-generated Aztec code up to the camera. The script will automatically decode the code, look up the item, and draw a bounding box around it.

*(Press `Q` in the scanner window to exit)*

## Features
- **Instant Lookup:** Commercial barcodes are automatically cached so looking up the same item repeatedly doesn't exhaust the API limits.
- **Local Database Support:** Store generated codes (starting with `2`) from self-weighing scales are automatically extracted and checked against an internal local database.
