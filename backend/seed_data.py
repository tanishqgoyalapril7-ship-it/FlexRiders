import os
import sys
from datetime import datetime, timedelta

# Ensure backend root is on python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal, Base, engine
from app.core.security import get_password_hash, UserRole
from app.models.all_models import (
    User,
    Rider,
    RiderDocument,
    Brand,
    RiderBrandAssignment,
    Payment,
    Notification,
    AuditLog,
    RiderStatus,
    PaymentStatus,
)


def seed():
    # Demo data is for local development only: it wipes the database and creates fake
    # brands, riders and payments. Never run it against the real (Supabase) database.
    if "--demo" not in sys.argv:
        sys.exit("Refusing to run: this script wipes the database and loads FAKE demo data.\n"
                 "Run `python seed_data.py --demo` only against a local SQLite database.")
    if not str(engine.url).startswith("sqlite"):
        sys.exit(f"Refusing to load demo data into a non-SQLite database ({engine.url.host}).")
    print("Initializing database tables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("Seeding Admin users...")
        super_admin = User(
            phone="+919999999999",
            email="admin@superriders.com",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        )
        ops_admin = User(
            phone="+919999999998",
            email="ops@superriders.com",
            hashed_password=get_password_hash("ops123"),
            role=UserRole.OPERATIONS_ADMIN,
            is_active=True,
        )
        fin_admin = User(
            phone="+919999999997",
            email="finance@superriders.com",
            hashed_password=get_password_hash("finance123"),
            role=UserRole.FINANCE_ADMIN,
            is_active=True,
        )
        db.add_all([super_admin, ops_admin, fin_admin])
        db.flush()

        print("Seeding Brands...")
        brands_data = [
            {"name": "Brand A", "code": "brand_a", "desc": "Premium Quick-Commerce Partner", "contact": "Rajesh Malhotra", "phone": "+919811223344"},
            {"name": "Brand B", "code": "brand_b", "desc": "Express Food Delivery Network", "contact": "Sanjay Verma", "phone": "+919822334455"},
            {"name": "Brand C", "code": "brand_c", "desc": "Urban Hyperlocal Logistics", "contact": "Anita Roy", "phone": "+919833445566"},
            {"name": "Brand D", "code": "brand_d", "desc": "Next-Day E-Commerce Freight", "contact": "Vikram Sethi", "phone": "+919844556677"},
            {"name": "Brand E", "code": "brand_e", "desc": "Green Electric Scooter Fleet", "contact": "Preeti Sen", "phone": "+919855667788"},
        ]
        created_brands = []
        for b in brands_data:
            brand_obj = Brand(
                name=b["name"],
                code=b["code"],
                description=b["desc"],
                contact_person=b["contact"],
                contact_number=b["phone"],
                is_active=True,
            )
            db.add(brand_obj)
            created_brands.append(brand_obj)
        db.flush()

        print("Seeding Primary Rider (Adarsh Chandel SR-000145)...")
        adarsh_user = User(
            phone="+919876543210",
            email="adarsh@gmail.com",
            hashed_password=get_password_hash("password123"),
            role=UserRole.RIDER,
            is_active=True,
        )
        db.add(adarsh_user)
        db.flush()

        adarsh_rider = Rider(
            user_id=adarsh_user.id,
            rider_id="SR-000145",
            full_name="Adarsh Chandel",
            mobile_number="+91 98765 43210",
            email="adarsh@gmail.com",
            profile_photo="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
            dob="28-11-2001",
            current_company="XYZ Logistics",
            current_role="Rider",
            experience_years=2,
            experience_months=4,
            vehicle_type="Bike",
            primary_city="Gurugram, Haryana",
            primary_area="Cyber City",
            additional_locations="DLF Phase 2, Sector 29",
            preferred_radius="10 km",
            upi_id="adarsh@okaxis",
            gpay_number="+91 98765 43210",
            status=RiderStatus.ACTIVE,
            created_at=datetime.utcnow() - timedelta(days=20),
        )
        db.add(adarsh_rider)
        db.flush()

        # Documents for Adarsh
        doc1 = RiderDocument(
            rider_id=adarsh_rider.id,
            doc_type="DRIVING_LICENSE",
            file_name="dl_adarsh_2026.pdf",
            file_url="https://example.com/docs/dl_adarsh.pdf",
            status="VERIFIED",
        )
        doc2 = RiderDocument(
            rider_id=adarsh_rider.id,
            doc_type="GOVT_ID",
            file_name="aadhaar_adarsh.pdf",
            file_url="https://example.com/docs/aadhaar_adarsh.pdf",
            status="VERIFIED",
        )
        doc3 = RiderDocument(
            rider_id=adarsh_rider.id,
            doc_type="VEHICLE_RC",
            file_name="bike_rc_dl8s.pdf",
            file_url="https://example.com/docs/rc_dl8s.pdf",
            status="VERIFIED",
        )
        db.add_all([doc1, doc2, doc3])

        # Brand assignment for Adarsh -> Brand A
        assignment1 = RiderBrandAssignment(
            rider_id=adarsh_rider.id,
            brand_id=created_brands[0].id,
            assigned_by_id=super_admin.id,
            assignment_date=datetime.utcnow() - timedelta(days=15),
            is_current=True,
            notes="Assigned to Brand A primary fleet",
        )
        db.add(assignment1)

        # Adarsh's Payments matching mockup
        pay1 = Payment(
            rider_id=adarsh_rider.id,
            brand_id=created_brands[0].id,
            amount=1250.0,
            payment_date=datetime.utcnow() - timedelta(hours=4),
            payment_period="September 2026",
            payment_type="UPI",
            upi_id="adarsh@okaxis",
            payment_reference="REF-SR000145-01",
            transaction_id="TXN123456789",
            status=PaymentStatus.PAID,
            created_by_id=fin_admin.id,
        )
        pay2 = Payment(
            rider_id=adarsh_rider.id,
            brand_id=created_brands[0].id,
            amount=900.0,
            payment_date=datetime.utcnow() - timedelta(days=2),
            payment_period="September 2026",
            payment_type="UPI",
            upi_id="adarsh@okaxis",
            payment_reference="REF-SR000145-02",
            transaction_id="TXN123456788",
            status=PaymentStatus.PAID,
            created_by_id=fin_admin.id,
        )
        pay3 = Payment(
            rider_id=adarsh_rider.id,
            brand_id=created_brands[0].id,
            amount=1100.0,
            payment_date=datetime.utcnow() - timedelta(days=4),
            payment_period="September 2026",
            payment_type="UPI",
            upi_id="adarsh@okaxis",
            payment_reference="REF-SR000145-03",
            transaction_id="TXN123456787",
            status=PaymentStatus.PAID,
            created_by_id=fin_admin.id,
        )
        pay4 = Payment(
            rider_id=adarsh_rider.id,
            brand_id=created_brands[0].id,
            amount=850.0,
            payment_date=datetime.utcnow() - timedelta(days=7),
            payment_period="September 2026",
            payment_type="UPI",
            upi_id="adarsh@okaxis",
            payment_reference="REF-SR000145-04",
            transaction_id=None,
            status=PaymentStatus.PENDING,
            created_by_id=fin_admin.id,
        )
        # Remaining sum to make ₹18,450 total: (1250+900+1100+850=4100), add prior bulk paid of 14,350
        pay_prior = Payment(
            rider_id=adarsh_rider.id,
            brand_id=created_brands[0].id,
            amount=14350.0,
            payment_date=datetime.utcnow() - timedelta(days=12),
            payment_period="September 2026",
            payment_type="UPI",
            upi_id="adarsh@okaxis",
            payment_reference="REF-SR000145-PRIOR",
            transaction_id="TXN123456700",
            status=PaymentStatus.PAID,
            created_by_id=fin_admin.id,
        )
        db.add_all([pay1, pay2, pay3, pay4, pay_prior])

        # Notifications for Adarsh matching mockup
        notifs_adarsh = [
            Notification(
                user_id=adarsh_user.id,
                title="Payment Received",
                message="₹1,250 credited to your account",
                category="PAYMENT",
                reference_id="TXN123456789",
                created_at=datetime.utcnow() - timedelta(hours=4),
            ),
            Notification(
                user_id=adarsh_user.id,
                title="Brand Assigned",
                message="You have been assigned to Brand A",
                category="BRAND",
                reference_id="Brand A",
                created_at=datetime.utcnow() - timedelta(days=2),
            ),
            Notification(
                user_id=adarsh_user.id,
                title="Registration Approved",
                message="Your registration has been approved",
                category="REGISTRATION",
                reference_id="SR-000145",
                created_at=datetime.utcnow() - timedelta(days=4),
            ),
            Notification(
                user_id=adarsh_user.id,
                title="Payment Initiated",
                message="Payment of ₹900 is being processed",
                category="PAYMENT",
                reference_id="PAY-900",
                created_at=datetime.utcnow() - timedelta(days=7),
            ),
            Notification(
                user_id=adarsh_user.id,
                title="Document Update Required",
                message="Please upload a valid driving licence",
                category="DOCUMENT",
                reference_id="DOC-DL",
                created_at=datetime.utcnow() - timedelta(days=10),
            ),
            Notification(
                user_id=adarsh_user.id,
                title="Welcome to Super Riders",
                message="Thank you for registering!",
                category="SYSTEM",
                reference_id="SR-000145",
                created_at=datetime.utcnow() - timedelta(days=12),
            ),
        ]
        db.add_all(notifs_adarsh)

        print("Seeding Pending & Additional Riders from mockup...")
        other_riders_data = [
            {"id": "SR-000246", "name": "Rohan Mehta", "company": "AB Logistics", "city": "Gurugram", "status": RiderStatus.PENDING, "phone": "+919876543220", "role": "Rider", "amount": 1250, "brand_idx": 0},
            {"id": "SR-000245", "name": "Priya Singh", "company": "Delivery Plus", "city": "Noida", "status": RiderStatus.PENDING, "phone": "+919876543221", "role": "Rider", "amount": 900, "brand_idx": 1},
            {"id": "SR-000244", "name": "Vikram Patel", "company": "FastTrack", "city": "Delhi", "status": RiderStatus.PENDING, "phone": "+919876543222", "role": "Rider", "amount": 1100, "brand_idx": 2},
            {"id": "SR-000243", "name": "Amit Singh", "company": "Urban Logistics", "city": "Gurgaon", "status": RiderStatus.PENDING, "phone": "+919876543223", "role": "Rider", "amount": 850, "brand_idx": 2},
            {"id": "SR-000242", "name": "Pooja Yadav", "company": "SwiftRiders", "city": "Gurugram", "status": RiderStatus.PENDING, "phone": "+919876543224", "role": "Rider", "amount": 1300, "brand_idx": 3},
            {"id": "SR-000241", "name": "Sandeep Kumar", "company": "Urban Logistics", "city": "Faridabad", "status": RiderStatus.APPROVED, "phone": "+919876543225", "role": "Rider", "amount": 1500, "brand_idx": 4},
            {"id": "SR-000240", "name": "Neha Verma", "company": "XYZ Logistics", "city": "Noida", "status": RiderStatus.ACTIVE, "phone": "+919876543226", "role": "Rider", "amount": 950, "brand_idx": 1},
            {"id": "SR-000239", "name": "Rahul Sharma", "company": "Example Logistics", "city": "Gurugram", "status": RiderStatus.ACTIVE, "phone": "+919876543227", "role": "Rider", "amount": 1250, "brand_idx": 0},
            {"id": "SR-000238", "name": "Karan Malhotra", "company": "QuickLog", "city": "Delhi", "status": RiderStatus.SUSPENDED, "phone": "+919876543228", "role": "Rider", "amount": 600, "brand_idx": 3},
        ]

        for item in other_riders_data:
            u = User(
                phone=item["phone"],
                email=f"{item['name'].lower().replace(' ', '.')}@example.com",
                hashed_password=get_password_hash("password123"),
                role=UserRole.RIDER,
                is_active=True,
            )
            db.add(u)
            db.flush()

            r = Rider(
                user_id=u.id,
                rider_id=item["id"],
                full_name=item["name"],
                mobile_number=item["phone"],
                email=u.email,
                profile_photo=f"https://api.dicebear.com/7.x/avataaars/svg?seed={item['id']}",
                dob="15-05-1998",
                current_company=item["company"],
                current_role="Rider",
                experience_years=1,
                experience_months=6,
                vehicle_type="Bike",
                primary_city=item["city"],
                primary_area="Sector 14",
                preferred_radius="12 km",
                upi_id=f"{item['phone'].replace('+91', '')}@upi",
                status=item["status"],
                created_at=datetime.utcnow() - timedelta(days=2),
            )
            db.add(r)
            db.flush()

            # Attach documents
            d = RiderDocument(
                rider_id=r.id,
                doc_type="DRIVING_LICENSE",
                file_name=f"dl_{item['id']}.pdf",
                file_url="https://example.com/docs/dl.pdf",
                status="PENDING" if item["status"] == RiderStatus.PENDING else "VERIFIED",
            )
            db.add(d)

            # Assign brand if active
            if item["status"] == RiderStatus.ACTIVE:
                assigned_brand = created_brands[item["brand_idx"]]
                asgn = RiderBrandAssignment(
                    rider_id=r.id,
                    brand_id=assigned_brand.id,
                    assigned_by_id=super_admin.id,
                    assignment_date=datetime.utcnow() - timedelta(days=5),
                    is_current=True,
                )
                db.add(asgn)

            # Sample payment
            pay_stat = PaymentStatus.PAID if item["status"] == RiderStatus.ACTIVE else (PaymentStatus.PENDING if item["status"] == RiderStatus.PENDING else PaymentStatus.FAILED)
            p = Payment(
                rider_id=r.id,
                brand_id=created_brands[item["brand_idx"]].id,
                amount=item["amount"],
                payment_date=datetime.utcnow() - timedelta(days=1),
                payment_period="September 2026",
                payment_type="UPI",
                upi_id=r.upi_id,
                payment_reference=f"REF-{r.rider_id}",
                transaction_id=f"TXN{r.id:06d}99",
                status=pay_stat,
                created_by_id=fin_admin.id,
            )
            db.add(p)

        print("Seeding Admin notifications & Audit logs...")
        admin_notifs = [
            Notification(
                is_admin_notification=True,
                title="New Rider Registration",
                message="Rahul Sharma registered from Example Logistics, Gurugram. Status: Pending Approval",
                category="REGISTRATION",
                reference_id="SR-000239",
                created_at=datetime.utcnow() - timedelta(minutes=5),
            ),
            Notification(
                is_admin_notification=True,
                title="Payment Received",
                message="Payment of ₹1,250 processed for Adarsh Chandel (SR-000145)",
                category="PAYMENT",
                reference_id="TXN123456789",
                created_at=datetime.utcnow() - timedelta(minutes=12),
            ),
            Notification(
                is_admin_notification=True,
                title="Brand Assigned",
                message="Brand A assigned to Adarsh Chandel by admin@superriders.com",
                category="BRAND",
                reference_id="SR-000145",
                created_at=datetime.utcnow() - timedelta(minutes=25),
            ),
            Notification(
                is_admin_notification=True,
                title="Rider Document Uploaded",
                message="Rohan Mehta uploaded Driving License for verification",
                category="DOCUMENT",
                reference_id="SR-000246",
                created_at=datetime.utcnow() - timedelta(hours=1),
            ),
            Notification(
                is_admin_notification=True,
                title="Payment Failed",
                message="Payment of ₹900 failed for SR-000238 due to invalid UPI ID",
                category="PAYMENT",
                reference_id="TXN900FAIL",
                created_at=datetime.utcnow() - timedelta(hours=2),
            ),
        ]
        db.add_all(admin_notifs)

        audit_entries = [
            AuditLog(
                admin_id=super_admin.id,
                admin_email="admin@superriders.com",
                action="BRAND_ASSIGNED",
                target_type="RIDER",
                target_id="SR-000145",
                details="Assigned to Brand A on 22 Sep 2026 18:32",
                ip_address="192.168.1.45",
                created_at=datetime.utcnow() - timedelta(minutes=30),
            ),
            AuditLog(
                admin_id=super_admin.id,
                admin_email="admin@superriders.com",
                action="RIDER_APPROVED",
                target_type="RIDER",
                target_id="SR-000145",
                details="Rider Adarsh Chandel approved after document verification",
                ip_address="192.168.1.45",
                created_at=datetime.utcnow() - timedelta(days=2),
            ),
            AuditLog(
                admin_id=fin_admin.id,
                admin_email="finance@superriders.com",
                action="PAYMENT_PROCESSED_SUCCESS",
                target_type="PAYMENT",
                target_id="TXN123456789",
                details="Payment of ₹1,250 marked PAID for SR-000145",
                ip_address="192.168.1.80",
                created_at=datetime.utcnow() - timedelta(hours=4),
            ),
        ]
        db.add_all(audit_entries)

        db.commit()
        print("Database seeding completed successfully!")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed()
