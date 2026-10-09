/**
 * Demonstration data used inside product mockups.
 * These are illustrative UI examples only — not real riders, brands or payments.
 */

export type RiderStatus =
  | "REGISTERED"
  | "PENDING REVIEW"
  | "APPROVED"
  | "BRAND ASSIGNED"
  | "ACTIVE";

export const demoRider = {
  id: "SR-000145",
  name: "Rahul Sharma",
  initials: "RS",
  city: "Gurugram",
  zone: "Sector 29",
  brand: "Brand A",
  company: "Demo Logistics",
  vehicle: "Two-wheeler",
  plate: "HR 26 •• ••42",
  phone: "+91 98••• ••210",
  status: "ACTIVE" as RiderStatus,
  since: "14 Mar 2026",
};

export const demoRiders: {
  id: string;
  name: string;
  city: string;
  brand: string;
  status: RiderStatus;
}[] = [
  { id: "SR-000145", name: "Rahul Sharma", city: "Gurugram", brand: "Brand A", status: "ACTIVE" },
  { id: "SR-000146", name: "Aman Verma", city: "Noida", brand: "Brand B", status: "ACTIVE" },
  { id: "SR-000147", name: "Priya Nair", city: "Bengaluru", brand: "—", status: "PENDING REVIEW" },
  { id: "SR-000148", name: "Imran Khan", city: "Delhi", brand: "Brand A", status: "APPROVED" },
  { id: "SR-000149", name: "Karan Mehta", city: "Gurugram", brand: "Brand C", status: "ACTIVE" },
  { id: "SR-000150", name: "Sneha Rao", city: "Pune", brand: "—", status: "REGISTERED" },
];

export const demoEarnings = {
  today: 850,
  month: 18450,
  txn: "TXN123456789",
};

export const demoPayments: {
  date: string;
  brand: string;
  amount: number;
  status: "PAID" | "PROCESSING";
  txn: string;
}[] = [
  { date: "24 Sep", brand: "Brand A", amount: 850, status: "PROCESSING", txn: "TXN123456790" },
  { date: "23 Sep", brand: "Brand A", amount: 920, status: "PAID", txn: "TXN123456789" },
  { date: "22 Sep", brand: "Brand A", amount: 780, status: "PAID", txn: "TXN123456731" },
  { date: "21 Sep", brand: "Brand A", amount: 1040, status: "PAID", txn: "TXN123456702" },
  { date: "20 Sep", brand: "Brand A", amount: 690, status: "PAID", txn: "TXN123456655" },
];

export const inr = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** Campaign cards for the rider-app mockups (Near You / Opening Soon / My Areas mirror the app's real filters). */
export type DemoCampaign = {
  name: string;
  brand: string;
  k: string;
  distance: string;
  rate: number;
  slots: number;
  vehicles: string;
  filter: "near" | "soon" | "areas";
  opensIn?: string;
};

export const demoCampaigns: DemoCampaign[] = [
  { name: "Café Launch Week", brand: "Brand A", k: "A", distance: "1.2 km", rate: 450, slots: 6, vehicles: "Bike · Cycle", filter: "near" },
  { name: "Store Opening Drive", brand: "Brand B", k: "B", distance: "3.8 km", rate: 600, slots: 3, vehicles: "Auto · Three Wheeler", filter: "soon", opensIn: "18h" },
  { name: "Neighbourhood Promo", brand: "Brand C", k: "C", distance: "Working area", rate: 400, slots: 9, vehicles: "All vehicles", filter: "areas" },
];

export const demoStreak = { current: 6, longest: 11, rate: 450 };
