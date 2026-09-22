# Super Riders — REST API Documentation (v1)

Base URL: `/api/v1`  
Interactive OpenAPI Explorer: `http://localhost:8000/docs`

---

## 1. Authentication Endpoints

### Login
- **Endpoint**: `POST /auth/login`
- **Request Body**:
```json
{
  "phone": "+919876543210",
  "password": "password123",
  "role_requested": "RIDER"
}
```
- **Response (200 OK)**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1...",
  "token_type": "bearer",
  "role": "RIDER",
  "user_id": 4,
  "rider_id": "SR-000145",
  "name": "Adarsh Chandel"
}
```

### Send OTP
- **Endpoint**: `POST /auth/otp/send`
- **Request Body**: `{"phone": "+919876543210"}`
- **Response**: `{"success": true, "message": "OTP sent", "otp_hint": "123456"}`

### Verify OTP
- **Endpoint**: `POST /auth/otp/verify`
- **Request Body**: `{"phone": "+919876543210", "otp": "123456"}`
- **Response**: Returns JWT `access_token` and user profile.

---

## 2. Rider Endpoints (Mobile App)

### Get Current Rider Profile & Home Dashboard
- **Endpoint**: `GET /riders/me`
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**:
```json
{
  "id": 1,
  "rider_id": "SR-000145",
  "full_name": "Adarsh Chandel",
  "mobile_number": "+91 98765 43210",
  "status": "ACTIVE",
  "current_brand": "Brand A",
  "primary_city": "Gurugram, Haryana",
  "vehicle_type": "Bike",
  "upi_id": "adarsh@okaxis",
  "total_earnings": 18450.0,
  "paid_earnings": 16900.0,
  "pending_earnings": 1550.0
}
```

### Get Rider Payment History
- **Endpoint**: `GET /riders/me/payments?month=September%202026`
- **Response**: Monthly earnings overview and array of individual payments.

---

## 3. Admin Rider Management

### List Riders with Filters
- **Endpoint**: `GET /admin/riders?status_filter=PENDING&city=Gurugram`
- **Headers**: `Authorization: Bearer <admin_token>`

### Approve Rider
- **Endpoint**: `PATCH /admin/riders/{id}/approve`
- **Response**: Moves status to `APPROVED` and sends notification.

### Reject Rider
- **Endpoint**: `PATCH /admin/riders/{id}/reject`
- **Payload**: `{"status": "REJECTED", "reason": "Documents unverified"}`

### Suspend / Reactivate Rider
- **Endpoint**: `PATCH /admin/riders/{id}/suspend`
- **Endpoint**: `PATCH /admin/riders/{id}/reactivate`

---

## 4. Brand Management & Assignment

### List Brands
- **Endpoint**: `GET /brands`
- **Response**: Array of brand partners with `active_riders_count`.

### Assign Rider to Brand (Activates Rider)
- **Endpoint**: `POST /brands/assign/{rider_id}`
- **Payload**:
```json
{
  "brand_id": 1,
  "notes": "Allocated to Gurgaon quick delivery hub"
}
```
- **Business Result**: Rider status transitions to `ACTIVE`, assignment history recorded, audit log generated, rider notified.

---

## 5. Payment Management & Settlements

### Record New Payment
- **Endpoint**: `POST /payments`
- **Payload**:
```json
{
  "rider_id": 1,
  "brand_id": 1,
  "amount": 1250.0,
  "payment_period": "September 2026",
  "payment_type": "UPI"
}
```

### Process / Settle Payment
- **Endpoint**: `POST /payments/{id}/process?action=PAID`
- **Response**: Status transitions to `PAID`, assigns unique `TXN...` ID, sends in-app receipt to rider.

---

## 6. Reports & Export

- **Dashboard Live Aggregations**: `GET /reports/dashboard`
- **Export Riders CSV**: `GET /reports/export/riders`
- **Export Payments CSV**: `GET /reports/export/payments`
