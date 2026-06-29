"""
AFC Uthiru Church Management System — FastAPI Sync Engine
v1.2 — Members + Email on create + Forgot/Reset Password + Full Audit Trail.
"""

import os
import json
from datetime import datetime, timedelta, timezone, date
from typing import Optional

import bcrypt
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.oauth2.service_account import Credentials

app = FastAPI(title="AFC Uthiru CMS API", version="1.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

CREDENTIALS_FILE = "afs-uthiru-cms-de0018a945c1.json"
SPREADSHEET_ID   = os.environ.get("SPREADSHEET_ID", "1tX_G4wlCKKRuPVPr-jy5f992jnmlp0y_3s-yd-UNkTs")
SCOPES           = ["https://www.googleapis.com/auth/spreadsheets"]
SECRET_KEY       = os.environ.get("SECRET_KEY", "CHANGE-THIS-BEFORE-PRODUCTION-AFC-UTHIRU")
ALGORITHM        = "HS256"
TOKEN_EXPIRY_MIN = 480

# ── Google Sheets Client Setup ───────────────────────────────────────────────
try:
    if os.path.exists(CREDENTIALS_FILE):
        creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=SCOPES)
    else:
        creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
        if not creds_json:
            raise RuntimeError("Missing Google Credentials mapping profile.")
        creds = Credentials.from_service_account_info(json.loads(creds_json), scopes=SCOPES)
    sheets_service = build("sheets", "v4", credentials=creds)
except Exception as e:
    print(f"CRITICAL: Failed to initialize Google Sheets service layer: {e}")
    sheets_service = None

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ── Pydantic Models ──────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str
    full_name: str
    email: str
    password: str
    is_admin: bool = False
    church_branch: str = "AFC UTHIRU"

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class MemberModel(BaseModel):
    s_n: Optional[str] = None
    membership_number: Optional[str] = ""
    full_name: str
    phone_number: Optional[str] = ""
    email: Optional[str] = ""
    sex: str
    marital_status: str
    date_of_birth: Optional[str] = ""
    residence: Optional[str] = ""
    landmark: Optional[str] = ""
    occupation: Optional[str] = ""
    membership_status: str = "ACTIVE"
    spouse_name: Optional[str] = ""
    no_of_children: Optional[str] = "0"
    conversion_date: Optional[str] = ""
    baptism_date: Optional[str] = ""
    holy_spirit_received: str = "NO"
    holy_spirit_date: Optional[str] = ""
    nok_name: Optional[str] = ""
    nok_relationship: Optional[str] = ""
    nok_phone: Optional[str] = ""
    photo_url: Optional[str] = ""
    departments: list[str] = []

class OverrideDeptRequest(BaseModel):
    department: str

class CurrentUser(BaseModel):
    username: str
    full_name: str
    is_admin: bool

# ── Spreadsheet Engine Helpers ────────────────────────────────────────────────
def sheet_to_list(sheet_name: str) -> list[dict]:
    """Fetch sheet records mapping rows automatically to columns headers."""
    if not sheets_service:
        return []
    try:
        res = sheets_service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID, range=f"{sheet_name}!A1:AZ2000"
        ).execute()
        rows = res.get("values", [])
        if not rows:
            return []
        headers = [str(h).strip().upper() for h in rows[0]]
        items = []
        for r in rows[1:]:
            padded = r + [""] * (len(headers) - len(r))
            items.append(dict(zip(headers, padded)))
        return items
    except Exception as e:
        print(f"Database sheet read breakdown error on '{sheet_name}': {e}")
        return []

def append_row(sheet_name: str, values: list):
    """Safely append a sequential data row to the bottom of target sheet table."""
    if not sheets_service:
        return
    sheets_service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A1",
        valueInputOption="USER_ENTERED",
        body={"values": [values]}
    ).execute()

def update_row(sheet_name: str, row_index: int, values: list):
    """Overwrite an entire row cleanly supporting arbitrary column layout matrixing (A to ZZ)."""
    n = len(values)
    if n == 0 or not sheets_service:
        return

    col_str = ""
    temp = n
    while temp > 0:
        temp, remainder = divmod(temp - 1, 26)
        col_str = chr(65 + remainder) + col_str

    range_a1 = f"{sheet_name}!A{row_index}:{col_str}{row_index}"
    
    sheets_service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=range_a1,
        valueInputOption="USER_ENTERED",
        body={"values": [values]}
    ).execute()

def next_sn(sheet_name: str) -> int:
    items = sheet_to_list(sheet_name)
    if not items:
        return 1
    try:
        return max(int(i.get("S_N", 0) or i.get("s_n", 0)) for i in items) + 1
    except:
        return len(items) + 1

# ── Security & Authentication Core ───────────────────────────────────────────
def _hash(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def _verify(pwd: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pwd.encode("utf-8"), hashed.encode("utf-8"))
    except:
        return False

def now_str() -> str:
    return datetime.now(timezone(timedelta(hours=3))).strftime("%Y-%m-%d %H:%M:%S")

def create_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=TOKEN_EXPIRY_MIN))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    credentials_exception = HTTPException(
        status_code=401, detail="Could not validate active security token credentials."
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    users = sheet_to_list("Users_db")
    user = next((u for u in users if u.get("USERNAME", "").lower() == username.lower()), None)
    if not user:
        raise credentials_exception

    if str(user.get("IS_ACTIVE", "")).upper() != "TRUE":
        raise HTTPException(status_code=403, detail="Your staff account has been deactivated.")

    is_admin = str(user.get("IS_ADMIN", "")).upper() == "TRUE"
    return CurrentUser(
        username=user.get("USERNAME"),
        full_name=user.get("FULL_NAME", user.get("USERNAME")),
        is_admin=is_admin
    )

def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied. Administrator privileges required.")
    return current_user

# ── Mock Email Dispatcher Stub ──────────────────────────────────────────────
def send_system_email(to_email: str, subject: str, body: str):
    print("================== [SYSTEM EMAIL OUTBOUND LOG] ==================")
    print(f"TO:      {to_email}")
    print(f"SUBJECT: {subject}")
    print(f"BODY:\n{body}")
    print("=================================================================")

# ── Dynamic Demographic Pipeline Rules ───────────────────────────────────────
def derive_department_1(sex: str, marital_status: str, dob_raw: str) -> str:
    """Deterministic routing mapping members straight to primary target groups."""
    s = str(sex).upper().strip()
    m = str(marital_status).upper().strip()
    
    if m in ["MARRIED", "WIDOWED", "DIVORCED", "SINGLE PARENT"]:
        return "BROTHERS UNION" if s == "MALE" else "SISTERS UNION"

    if not dob_raw or str(dob_raw).strip() in ["", "—"]:
        return "YOUTH DEPARTMENT"

    try:
        dob = datetime.strptime(str(dob_raw).strip(), "%Y-%m-%d").date()
        today = date.today()
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        
        if age <= 12:
            return "SUNDAY SCHOOL"
        elif age <= 17:
            return "PRE-YOUTH DEPARTMENT"
        elif age <= 35:
            return "YOUTH DEPARTMENT"
        else:
            return "BROTHERS UNION" if s == "MALE" else "SISTERS UNION"
    except:
        return "YOUTH DEPARTMENT"

# ── Authentication Endpoints ──────────────────────────────────────────────────
@app.post("/api/auth/login", tags=["Auth"])
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    users = sheet_to_list("Users_db")
    user = next((u for u in users if u.get("USERNAME", "").lower() == form_data.username.lower()), None)
    
    if not user or not _verify(form_data.password, user.get("PASSWORD", "")):
        _audit(form_data.username, "LOGIN_FAILED", "AUTH", form_data.username, "Invalid credential challenge details.")
        raise HTTPException(status_code=401, detail="Incorrect username or password.")

    if str(user.get("IS_ACTIVE", "")).upper() != "TRUE":
        _audit(form_data.username, "LOGIN_BLOCKED", "AUTH", form_data.username, "Login denied on disabled user record.")
        raise HTTPException(status_code=403, detail="Account inactive. Please contact administration.")

    is_admin = str(user.get("IS_ADMIN", "")).upper() == "TRUE"
    token = create_token(data={"sub": user.get("USERNAME")})
    
    _audit(user.get("USERNAME"), "LOGIN", "AUTH", user.get("USERNAME"), "User authenticated successfully.")
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "full_name": user.get("FULL_NAME"),
        "is_admin": is_admin
    }

@app.post("/api/auth/forgot-password", tags=["Auth"])
def forgot_password(req: ForgotPasswordRequest):
    users = sheet_to_list("Users_db")
    user = next((u for u in users if u.get("EMAIL", "").lower() == req.email.lower()), None)
    
    if user:
        reset_token = create_token(
            data={"sub": user.get("USERNAME"), "purpose": "password_reset"},
            expires_delta=timedelta(hours=1)
        )
        reset_link = f"http://localhost:5173/reset-password?token={reset_token}"
        body = (
            f"Hello {user.get('FULL_NAME')},\n\n"
            f"You requested a password reset for the AFC Uthiru CMS portal.\n"
            f"Click the link below to configure your new login password:\n{reset_link}\n\n"
            f"This security link will expire in 1 hour."
        )
        send_system_email(user.get("EMAIL"), "AFC CMS — Reset Password Request", body)
        _audit(user.get("USERNAME"), "FORGOT_PASSWORD", "AUTH", user.get("USERNAME"), "Reset link dispatched to inbox.")
    
    return {"detail": "If an account exists with that email, a password reset link has been dispatched."}

@app.post("/api/auth/reset-password", tags=["Auth"])
def reset_password(req: ResetPasswordRequest):
    try:
        payload = jwt.decode(req.token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        purpose = payload.get("purpose")
        if not username or purpose != "password_reset":
            raise HTTPException(status_code=400, detail="Invalid token scope configuration.")
    except JWTError:
        raise HTTPException(status_code=400, detail="The reset security token link has expired or is invalid.")

    users = sheet_to_list("Users_db")
    row_idx = None
    target_user = None

    for idx, u in enumerate(users, start=2):
        if u.get("USERNAME", "").lower() == username.lower():
            row_idx = idx
            target_user = u
            break

    if not row_idx or not target_user:
        raise HTTPException(status_code=404, detail="Target user profile record could not be found.")

    hashed_pwd = _hash(req.new_password)
    updated_row_values = [
        target_user.get("S_N", ""),
        target_user.get("USERNAME", ""),
        target_user.get("FULL_NAME", ""),
        target_user.get("EMAIL", ""),
        hashed_pwd,
        target_user.get("IS_ADMIN", "FALSE"),
        target_user.get("IS_ACTIVE", "TRUE"),
        target_user.get("CHURCH_BRANCH", "AFC UTHIRU"),
        now_str()
    ]

    update_row("Users_db", row_idx, updated_row_values)
    _audit(username, "RESET_PASSWORD", "AUTH", username, "Password updated successfully via valid reset link token.")
    
    return {"detail": "Password has been successfully refactored."}

# ── User Administration Endpoints ────────────────────────────────────────────
@app.get("/api/users", tags=["Users"])
def get_users(_: CurrentUser = Depends(require_admin)):
    records = sheet_to_list("Users_db")
    clean = []
    for r in records:
        c = r.copy()
        if "PASSWORD" in c:
            del c["PASSWORD"]
        clean.append(c)
    return clean

@app.post("/api/users", tags=["Users"])
def create_user(user: UserCreate, current_user: CurrentUser = Depends(require_admin)):
    users = sheet_to_list("Users_db")
    if any(u.get("USERNAME", "").lower() == user.username.lower() for u in users):
        raise HTTPException(status_code=400, detail="Username is already occupied.")
    if any(u.get("EMAIL", "").lower() == user.email.lower() for u in users):
        raise HTTPException(status_code=400, detail="Email address is already in use.")

    sn = next_sn("Users_db")
    append_row("Users_db", [
        sn, user.username.strip(), user.full_name.strip(), user.email.strip(),
        _hash(user.password), str(user.is_admin).upper(), "TRUE", user.church_branch.upper(), now_str()
    ])

    body = (
        f"Hello {user.full_name},\n\n"
        f"An administrative worker account has been initialized for you on the AFC Uthiru CMS portal.\n"
        f"Your active dashboard login profile credentials are:\n"
        f"Username: {user.username}\n"
        f"Password: {user.password}\n\n"
        f"Please alter this temporary credential configuration immediately upon system entry."
    )
    send_system_email(user.email, "Welcome to AFC Uthiru CMS Portal", body)
    _audit(current_user.username, "CREATE_USER", "USERS", user.username, f"Registered account profile for {user.full_name}.")
    return {"detail": "User account created successfully."}

@app.post("/api/users/deactivate/{username}", tags=["Users"])
def deactivate_user(username: str, current_user: CurrentUser = Depends(require_admin)):
    if current_user.username.lower() == username.lower():
        raise HTTPException(status_code=400, detail="Self deactivation actions are blocked.")

    users = sheet_to_list("Users_db")
    row_idx = None
    target_user = None

    for idx, u in enumerate(users, start=2):
        if u.get("USERNAME", "").lower() == username.lower():
            row_idx = idx
            target_user = u
            break

    if not row_idx or not target_user:
        raise HTTPException(status_code=404, detail="Target user account profile was not found.")

    updated_row_values = [
        target_user.get("S_N", ""), target_user.get("USERNAME", ""), target_user.get("FULL_NAME", ""),
        target_user.get("EMAIL", ""), target_user.get("PASSWORD", ""), target_user.get("IS_ADMIN", "FALSE"),
        "FALSE", target_user.get("CHURCH_BRANCH", "AFC UTHIRU"), now_str()
    ]
    
    update_row("Users_db", row_idx, updated_row_values)
    _audit(current_user.username, "DEACTIVATE_USER", "USERS", username, "Suspended administrative account security access profiles.")
    return {"detail": "Account record set to inactive status."}

# ── Members Management Endpoints ─────────────────────────────────────────────
@app.get("/api/members", tags=["Members"])
def get_members(_: CurrentUser = Depends(get_current_user)):
    records = sheet_to_list("Members_db")
    for r in records:
        depts_raw = r.get("DEPARTMENTS", "")
        r["DEPARTMENTS"] = [d.strip() for d in depts_raw.split(",") if d.strip()] if depts_raw else []
    return records

@app.post("/api/members", tags=["Members"])
def add_member(m: MemberModel, current_user: CurrentUser = Depends(get_current_user)):
    sn = next_sn("Members_db")
    primary_dept = derive_department_1(m.sex, m.marital_status, m.date_of_birth)
    
    final_depts = m.departments.copy()
    if primary_dept not in final_depts:
        final_depts.insert(0, primary_dept)

    depts_str = ",".join(final_depts)
    append_row("Members_db", [
        sn, m.membership_number, m.full_name.strip(), m.phone_number, m.email,
        m.sex.upper(), m.marital_status.upper(), m.date_of_birth, m.residence, m.landmark,
        m.occupation, m.membership_status.upper(), m.spouse_name, m.no_of_children,
        m.conversion_date, m.baptism_date, m.holy_spirit_received.upper(), m.holy_spirit_date,
        m.nok_name, m.nok_relationship, m.nok_phone, m.photo_url, primary_dept, depts_str, now_str()
    ])

    _audit(current_user.username, "ADD_MEMBER", "MEMBERS", str(sn), f"Registered core profile record for {m.full_name}.")
    return {"detail": "Member record created safely."}

@app.put("/api/members/{sn}", tags=["Members"])
def update_member(sn: str, m: MemberModel, current_user: CurrentUser = Depends(get_current_user)):
    members = sheet_to_list("Members_db")
    row_idx = None
    for idx, row in enumerate(members, start=2):
        if str(row.get("S_N", "") or row.get("s_n", "")) == str(sn):
            row_idx = idx
            break

    if not row_idx:
        raise HTTPException(status_code=404, detail="Target tracking member index row was not found.")

    primary_dept = derive_department_1(m.sex, m.marital_status, m.date_of_birth)
    final_depts = m.departments.copy()
    if primary_dept not in final_depts:
        final_depts.insert(0, primary_dept)

    depts_str = ",".join(final_depts)
    update_row("Members_db", row_idx, [
        sn, m.membership_number, m.full_name.strip(), m.phone_number, m.email,
        m.sex.upper(), m.marital_status.upper(), m.date_of_birth, m.residence, m.landmark,
        m.occupation, m.membership_status.upper(), m.spouse_name, m.no_of_children,
        m.conversion_date, m.baptism_date, m.holy_spirit_received.upper(), m.holy_spirit_date,
        m.nok_name, m.nok_relationship, m.nok_phone, m.photo_url, primary_dept, depts_str, now_str()
    ])

    _audit(current_user.username, "UPDATE_MEMBER", "MEMBERS", str(sn), f"Altered details for tracking record {m.full_name}.")
    return {"detail": "Member information synchronized successfully."}

@app.delete("/api/members/{sn}", tags=["Members"])
def delete_member(sn: str, current_user: CurrentUser = Depends(get_current_user)):
    members = sheet_to_list("Members_db")
    row_idx = None
    target_name = "Unknown"

    for idx, row in enumerate(members, start=2):
        if str(row.get("S_N", "") or row.get("s_n", "")) == str(sn):
            row_idx = idx
            target_name = row.get("FULL_NAME", "Unknown")
            break

    if not row_idx:
        raise HTTPException(status_code=404, detail="Target member reference not found.")

    if not sheets_service:
        raise HTTPException(status_code=500, detail="Spreadsheet connection is unavailable.")

    res = sheets_service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
    sheet_id = next(s["properties"]["sheetId"] for s in res["sheets"] if s["properties"]["title"] == "Members_db")

    body = {
        "requests": [{
            "deleteDimension": {
                "range": {
                    "sheetId": sheet_id,
                    "dimension": "ROWS",
                    "startIndex": row_idx - 1,
                    "endIndex": row_idx
                }
            }
        }]
    }
    sheets_service.spreadsheets().batchUpdate(spreadsheetId=SPREADSHEET_ID, body=body).execute()
    _audit(current_user.username, "DELETE_MEMBER", "MEMBERS", str(sn), f"Purged member row profile belonging to: {target_name}.")
    return {"detail": "Member profile row deleted successfully."}

@app.post("/api/members/{sn}/override-department", tags=["Members"])
def override_department(sn: str, req: OverrideDeptRequest, current_user: CurrentUser = Depends(require_admin)):
    members = sheet_to_list("Members_db")
    row_idx = None
    target_member = None

    for idx, row in enumerate(members, start=2):
        if str(row.get("S_N", "") or row.get("s_n", "")) == str(sn):
            row_idx = idx
            target_member = row
            break

    if not row_idx or not target_member:
        raise HTTPException(status_code=404, detail="Member matching structural lookup index reference not found.")

    depts_raw = target_member.get("DEPARTMENTS", "")
    current_depts = [d.strip() for d in depts_raw.split(",") if d.strip()] if depts_raw else []
    
    if req.department not in current_depts:
        current_depts.insert(0, req.department)
    else:
        current_depts.remove(req.department)
        current_depts.insert(0, req.department)

    depts_str = ",".join(current_depts)
    update_row("Members_db", row_idx, [
        target_member.get("S_N"), target_member.get("MEMBERSHIP_NUMBER"), target_member.get("FULL_NAME"),
        target_member.get("PHONE_NUMBER"), target_member.get("EMAIL"), target_member.get("SEX"),
        target_member.get("MARITAL_STATUS"), target_member.get("DATE_OF_BIRTH"), target_member.get("RESIDENCE"),
        target_member.get("LANDMARK"), target_member.get("OCCUPATION"), target_member.get("MEMBERSHIP_STATUS"),
        target_member.get("SPOUSE_NAME"), target_member.get("NO_OF_CHILDREN"), target_member.get("CONVERSION_DATE"),
        target_member.get("BAPTISM_DATE"), target_member.get("HOLY_SPIRIT_RECEIVED"), target_member.get("HOLY_SPIRIT_DATE"),
        target_member.get("NOK_NAME"), target_member.get("NOK_RELATIONSHIP"), target_member.get("NOK_PHONE"),
        target_member.get("PHOTO_URL"), req.department, depts_str, now_str()
    ])

    _audit(current_user.username, "OVERRIDE_DEPARTMENT", "MEMBERS", str(sn), 
           f"Forced manual primary department realignment to '{req.department}' for {target_member.get('FULL_NAME')}.")
    return {"detail": "Primary structural department mapping overriden successfully."}

# ── Audit Infrastructure Core ───────────────────────────────────────────────
def _audit(username: str, action: str, module: str, item_id: str, description: str):
    """Write an audit entry. Never raises — audit must not break main flow."""
    try:
        sn = next_sn("AuditLog_db")
        append_row("AuditLog_db", [sn, now_str(), username, action, module, item_id, description])
    except Exception as e:
        print(f"Audit log writing fallback breakdown error: {e}")

@app.get("/api/audit", tags=["Audit"])
def get_audit_log(_: CurrentUser = Depends(require_admin)):
    records = sheet_to_list("AuditLog_db")
    return list(reversed(records))

@app.get("/api/audit/search", tags=["Audit"])
def search_audit_log(q: str = "", action: str = "", module: str = "",
                     _: CurrentUser = Depends(require_admin)):
    """Admin only — filter audit trail by free-text, action, and/or module."""
    records = list(reversed(sheet_to_list("AuditLog_db")))
    if action:
        records = [r for r in records if r.get("ACTION", "").upper() == action.upper()]
    if module:
        records = [r for r in records if r.get("MODULE", "").upper() == module.upper()]
    if q:
        q_low = q.lower()
        records = [
            r for r in records if 
            q_low in r.get("USERNAME", "").lower() or 
            q_low in r.get("DESCRIPTION", "").lower() or 
            q_low in r.get("ITEM_ID", "").lower()
        ]
    return records
