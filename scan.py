import cv2
from pyzbar.pyzbar import decode
import zxingcpp
import openfoodfacts
import time
import requests

# Initialize API
api = openfoodfacts.API(user_agent="FridgeScanner/1.0")

# Cache to avoid hitting the API repeatedly for the same item and getting 429s
PRODUCT_CACHE = {}

# Local DB for store-generated scale barcodes (e.g., Migros/Coop)
# Format is usually 2X IIIII PPPPP C, where IIIII is item code and PPPPP is price.
LOCAL_DB = {
    "24187": "Karotten"
}

def get_product_info(barcode):
    # 1. Check if it's a local store barcode (starts with 2, usually 13 digits)
    if len(barcode) == 13 and barcode.startswith("2"):
        item_code = barcode[2:7]
        val = barcode[7:12]
        price_chf = int(val) / 100.0
        
        product_name = LOCAL_DB.get(item_code, f"Local Item {item_code}")
        return f"\n  Product: {product_name}\n  Price: {price_chf:.2f} CHF\n"

    # 2. Check cache
    if barcode in PRODUCT_CACHE:
        return PRODUCT_CACHE[barcode]

    print(f"Looking up {barcode}...")
    try:
        # Requesting without 'fields' constraints to get the maximum amount of data
        result = api.product.get(barcode)
        if result:
            lines = []
            
            # A curated list of the most useful readable fields from the giant OpenFoodFacts dump
            keys = [
                ("Product", "product_name"),
                ("Brand", "brands"),
                ("Quantity", "quantity"),
                ("Packaging", "packaging"),
                ("Categories", "categories"),
                ("Ingredients", "ingredients_text"),
                ("Allergens", "allergens"),
                ("Nutri-Score", "nutriscore_grade"),
                ("Eco-Score", "ecoscore_grade"),
                ("NOVA Group", "nova_group"),
                ("Stores", "stores"),
                ("Countries", "countries")
            ]
            
            for label, key in keys:
                val = result.get(key)
                if val:
                    val = str(val).replace('\r', '').replace('\n', ' ').strip()
                    if val.lower() not in ['unknown', 'n/a', 'none', '']:
                        if key in ['nutriscore_grade', 'ecoscore_grade']:
                            val = val.upper()
                        lines.append(f"  {label}: {val}")
                        
            if not lines:
                info = " Found product but no details available."
            else:
                info = "\n" + "\n".join(lines) + "\n"
                
            PRODUCT_CACHE[barcode] = info
            return info
        
        PRODUCT_CACHE[barcode] = " Not found in database"
        return " Not found in database"
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 429:
            return " API Rate Limit (Too Many Requests). Try again later."
        return f" API Error: {e}"
    except Exception as e:
        return f" Error: {e}"

# 1. Start the Camera
cap = cv2.VideoCapture(1) 

print("Starting scanner... If your iPhone is nearby and locked,")
print("macOS should automatically prompt it to wake up.")

last_scanned = ""
last_scan_time = 0.0
frame_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break
        
    frame_count += 1
    gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # We will collect codes from both pyzbar and zxingcpp to guarantee we catch everything
    detected_texts = set()
    all_codes = []

    # 1. PyZbar (Fast, excellent for standard 1D and QR)
    for barcode in decode(gray_frame):
        text = barcode.data.decode('utf-8')
        if text not in detected_texts:
            detected_texts.add(text)
            (x, y, w, h) = barcode.rect
            all_codes.append((text, (x, y, x + w, y + h)))
            
    # 2. ZXing C++ (Super fast, excellent for Aztec and DataMatrix!)
    # Migros codes are specifically Aztec codes (they have a square bullseye in the exact center)
    zxing_results = zxingcpp.read_barcodes(gray_frame)
    for z in zxing_results:
        if z.text not in detected_texts:
            detected_texts.add(z.text)
            # Extrapolate a bounding box from ZXing corners
            x1 = min(z.position.top_left.x, z.position.bottom_left.x)
            y1 = min(z.position.top_left.y, z.position.top_right.y)
            x2 = max(z.position.bottom_right.x, z.position.top_right.x)
            y2 = max(z.position.bottom_right.y, z.position.bottom_left.y)
            all_codes.append((z.text, (x1, y1, x2, y2)))

    for text, (x1, y1, x2, y2) in all_codes:
        current_time = time.time()
        
        # Avoid processing the EXACT same code constantly, but allow re-scan after 3 seconds
        if text != last_scanned or (current_time - last_scan_time) > 3.0:
            product_details = get_product_info(text)
            print(f"[{text}] {product_details}")
            last_scanned = text
            last_scan_time = current_time
            
        # Draw a box around the barcode on screen
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

    cv2.imshow('Fridge Scanner (Press Q to quit)', frame)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()