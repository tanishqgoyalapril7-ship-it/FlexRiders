# Super Riders — Relational Database Schema Specification

## Entity Relationship Overview

The database is built on relational standards supporting PostgreSQL in production and SQLite in zero-config development environments.

```mermaid
erDiagram
    users ||--o| riders : "has profile"
    users ||--o{ notifications : "receives"
    users ||--o{ audit_logs : "performs"
    riders ||--o{ rider_documents : "uploads"
    riders ||--o{ rider_brand_assignments : "assigned to"
    riders ||--o{ payments : "receives"
    brands ||--o{ rider_brand_assignments : "has riders"
    brands ||--o{ payments : "billed for"

    users {
        int id PK
        string phone UK
        string email UK
        string hashed_password
        string role
        boolean is_active
        datetime created_at
    }

    riders {
        int id PK
        int user_id FK
        string rider_id UK "SR-000145"
        string full_name
        string mobile_number
        string email
        string profile_photo
        string dob
        string current_company
        string current_role
        string vehicle_type
        string primary_city
        string primary_area
        string preferred_radius
        string upi_id
        string gpay_number
        string status "PENDING | APPROVED | ACTIVE | SUSPENDED"
        datetime created_at
    }

    rider_documents {
        int id PK
        int rider_id FK
        string doc_type "GOVT_ID | DRIVING_LICENSE | VEHICLE_RC"
        string file_name
        string file_url
        string status "PENDING | VERIFIED | REJECTED"
        datetime created_at
    }

    brands {
        int id PK
        string name UK
        string code UK
        string description
        string contact_person
        string contact_number
        boolean is_active
        datetime created_at
    }

    rider_brand_assignments {
        int id PK
        int rider_id FK
        int brand_id FK
        int assigned_by_id FK
        datetime assignment_date
        datetime removal_date
        boolean is_current
        text notes
    }

    payments {
        int id PK
        int rider_id FK
        int brand_id FK
        float amount
        datetime payment_date
        string payment_period
        string payment_type "UPI | Bank Transfer"
        string upi_id
        string transaction_id UK
        string status "PENDING | PROCESSING | PAID | FAILED"
        string failure_reason
    }

    audit_logs {
        int id PK
        int admin_id FK
        string admin_email
        string action
        string target_type
        string target_id
        text details
        string ip_address
        datetime created_at
    }
```
