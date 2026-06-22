# test_connection.py
import os
from main import sheet_to_list, SPREADSHEET_ID, CREDENTIALS_FILE

def verify_google_sheets_connection():
    print("=" * 60)
    print("AFC UTHIRU SYNC ENGINE — CONNECTION DIAGNOSTIC")
    print("=" * 60)
    
    # Check 1: File Existence
    print(f"[*] Checking local JSON credentials file '{CREDENTIALS_FILE}'...")
    if not os.path.exists(CREDENTIALS_FILE):
        print(f"[-] ERROR: '{CREDENTIALS_FILE}' was not found in this folder.")
        return
    print("[+] Success: Credentials file exists.")
    
    # Check 2: Spreadsheet ID setup
    print(f"[*] Checking Spreadsheet ID configuration...")
    if SPREADSHEET_ID == "1jNWNUoTHPRK4zzLYrmJjDn2Vs3Yfr_NUFz3zRlG33Wo" or not SPREADSHEET_ID:
        print("[-] ERROR: You have not replaced 'YOUR_SPREADSHEET_ID_HERE' with your real Google Sheet ID in main.py.")
        return
    print(f"[+] Success: ID configured ({SPREADSHEET_ID[:5]}...{SPREADSHEET_ID[-5:]})")
    
    # Check 3: Live API Request
    print("[*] Attempting live API handshake with Google Sheets...")
    try:
        # Attempting to read the Master Departments list (headers start on Row 6)
        departments = sheet_to_list("Departments_db", header_row=6)
        print("[+] SUCCESS! Handshake completed.")
        print(f"[+] Connection status: LIVE. Retrieved {len(departments)} departments from the sheet.")
        
        if len(departments) > 0:
            print("\n[*] Sample data pulled successfully:")
            for idx, dept in enumerate(departments[:3]):
                print(f"    - Dept {idx+1}: {dept.get('UNIT_NAME')} ({dept.get('UNIT_TYPE')})")
                
    except Exception as e:
        print("\n[-] CONNECTION FAILED!")
        print(f"[-] Error Details: {str(e)}")
        print("\n[?] Troubleshooting Checklist:")
        print("    1. Make sure you shared your Google Sheet with the client_email found inside your JSON file.")
        print("    2. Make sure the Google Sheets API is enabled in your Google Cloud Console.")
        print("    3. Double check that the sheet names match exactly (e.g., 'Departments_db').")
    print("=" * 60)

if __name__ == "__main__":
    verify_google_sheets_connection()