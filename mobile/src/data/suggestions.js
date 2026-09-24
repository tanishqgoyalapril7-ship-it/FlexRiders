// Offline suggestion lists for the registration form. Riders can still type any value.

export const CITIES = [
  'Agra', 'Ahmedabad', 'Ajmer', 'Aligarh', 'Allahabad (Prayagraj)', 'Ambala', 'Amritsar', 'Aurangabad', 'Bareilly',
  'Bathinda', 'Belagavi', 'Bengaluru', 'Bhiwadi', 'Bhopal', 'Bhubaneswar', 'Bikaner', 'Chandigarh', 'Chennai',
  'Coimbatore', 'Cuttack', 'Dehradun', 'Delhi', 'Dhanbad', 'Durgapur', 'Faridabad', 'Ghaziabad', 'Goa', 'Gorakhpur',
  'Greater Noida', 'Guntur', 'Gurugram', 'Guwahati', 'Gwalior', 'Haridwar', 'Hisar', 'Howrah', 'Hubballi', 'Hyderabad',
  'Indore', 'Jabalpur', 'Jaipur', 'Jalandhar', 'Jammu', 'Jamshedpur', 'Jodhpur', 'Kanpur', 'Karnal', 'Kochi', 'Kolhapur',
  'Kolkata', 'Kota', 'Kozhikode', 'Lucknow', 'Ludhiana', 'Madurai', 'Mangaluru', 'Meerut', 'Mohali', 'Moradabad',
  'Mumbai', 'Mysuru', 'Nagpur', 'Nashik', 'Navi Mumbai', 'Noida', 'Panchkula', 'Panipat', 'Patiala', 'Patna',
  'Puducherry', 'Pune', 'Raipur', 'Rajkot', 'Ranchi', 'Rohtak', 'Salem', 'Sonipat', 'Surat', 'Thane',
  'Thiruvananthapuram', 'Thrissur', 'Tiruchirappalli', 'Udaipur', 'Vadodara', 'Varanasi', 'Vijayawada',
  'Visakhapatnam', 'Warangal', 'Zirakpur',
];

// Popular delivery areas for the larger cities.
export const AREAS = {
  Gurugram: [
    'DLF Phase 1', 'DLF Phase 2', 'DLF Phase 3', 'DLF Phase 4', 'DLF Phase 5', 'Cyber City', 'Golf Course Road',
    'Golf Course Extension Road', 'Sohna Road', 'MG Road', 'Udyog Vihar', 'Palam Vihar', 'South City 1', 'South City 2',
    'Sushant Lok', 'Nirvana Country', 'Old Gurgaon', 'New Gurgaon', 'Manesar', 'Dwarka Expressway', 'Sector 14',
    'Sector 29', 'Sector 31', 'Sector 45', 'Sector 46', 'Sector 49', 'Sector 56', 'Sector 57', 'Sector 65',
    'Sector 82', 'Sector 83', 'Badshahpur', 'Sikanderpur',
  ],
  Delhi: [
    'Connaught Place', 'Karol Bagh', 'Lajpat Nagar', 'Saket', 'Hauz Khas', 'Greater Kailash', 'Malviya Nagar',
    'Vasant Kunj', 'Vasant Vihar', 'Dwarka', 'Janakpuri', 'Rajouri Garden', 'Punjabi Bagh', 'Pitampura', 'Rohini',
    'Shalimar Bagh', 'Model Town', 'Mukherjee Nagar', 'Laxmi Nagar', 'Preet Vihar', 'Mayur Vihar', 'Kalkaji',
    'Nehru Place', 'Okhla', 'Chandni Chowk', 'Paharganj', 'Patel Nagar', 'Uttam Nagar', 'Mahipalpur', 'Chhatarpur',
  ],
  Noida: [
    'Sector 15', 'Sector 18', 'Sector 50', 'Sector 62', 'Sector 63', 'Sector 76', 'Sector 78', 'Sector 93',
    'Sector 104', 'Sector 125', 'Sector 128', 'Sector 137', 'Sector 150', 'Noida Extension', 'Film City', 'Atta Market',
  ],
  'Greater Noida': ['Pari Chowk', 'Alpha 1', 'Beta 1', 'Gamma 1', 'Knowledge Park', 'Greater Noida West', 'Jaypee Greens'],
  Ghaziabad: ['Indirapuram', 'Vaishali', 'Vasundhara', 'Kaushambi', 'Raj Nagar Extension', 'Crossings Republik', 'Kavi Nagar'],
  Faridabad: ['Sector 15', 'Sector 21', 'NIT', 'Old Faridabad', 'Ballabgarh', 'Greater Faridabad', 'Surajkund'],
  Bengaluru: [
    'Koramangala', 'Indiranagar', 'HSR Layout', 'BTM Layout', 'Jayanagar', 'JP Nagar', 'Whitefield', 'Marathahalli',
    'Bellandur', 'Sarjapur Road', 'Electronic City', 'Hebbal', 'Yelahanka', 'Malleshwaram', 'Rajajinagar',
    'Banashankari', 'Basavanagudi', 'MG Road', 'Ulsoor', 'Frazer Town', 'KR Puram', 'Bannerghatta Road', 'Hennur',
  ],
  Mumbai: [
    'Andheri East', 'Andheri West', 'Bandra', 'Borivali', 'Chembur', 'Colaba', 'Dadar', 'Ghatkopar', 'Goregaon',
    'Juhu', 'Kandivali', 'Kurla', 'Lower Parel', 'Malad', 'Powai', 'Santacruz', 'Vile Parle', 'Worli', 'Mulund', 'Byculla',
  ],
  'Navi Mumbai': ['Vashi', 'Nerul', 'Belapur', 'Kharghar', 'Airoli', 'Ghansoli', 'Sanpada', 'Panvel'],
  Thane: ['Ghodbunder Road', 'Majiwada', 'Naupada', 'Vartak Nagar', 'Kopri', 'Wagle Estate'],
  Pune: [
    'Kothrud', 'Hinjewadi', 'Wakad', 'Baner', 'Aundh', 'Viman Nagar', 'Kharadi', 'Hadapsar', 'Magarpatta',
    'Koregaon Park', 'Shivajinagar', 'Deccan', 'Pimpri', 'Chinchwad', 'Kondhwa', 'Wagholi',
  ],
  Hyderabad: [
    'Banjara Hills', 'Jubilee Hills', 'Gachibowli', 'HITEC City', 'Madhapur', 'Kondapur', 'Kukatpally', 'Ameerpet',
    'Begumpet', 'Secunderabad', 'Somajiguda', 'Dilsukhnagar', 'LB Nagar', 'Miyapur', 'Manikonda', 'Uppal',
  ],
  Chennai: [
    'T Nagar', 'Anna Nagar', 'Adyar', 'Velachery', 'OMR', 'Guindy', 'Mylapore', 'Nungambakkam', 'Tambaram',
    'Porur', 'Perungudi', 'Sholinganallur', 'Egmore', 'Chromepet',
  ],
  Kolkata: [
    'Salt Lake', 'New Town', 'Park Street', 'Ballygunge', 'Gariahat', 'Behala', 'Dum Dum', 'Tollygunge', 'Jadavpur',
    'Howrah', 'Rajarhat', 'Esplanade',
  ],
  Ahmedabad: ['Navrangpura', 'Satellite', 'Bodakdev', 'Prahlad Nagar', 'Vastrapur', 'Maninagar', 'SG Highway', 'Chandkheda', 'Gota'],
  Jaipur: ['Malviya Nagar', 'Vaishali Nagar', 'Mansarovar', 'C Scheme', 'Raja Park', 'Jagatpura', 'Tonk Road', 'Sodala'],
  Chandigarh: ['Sector 17', 'Sector 22', 'Sector 35', 'Sector 43', 'Manimajra', 'Industrial Area'],
  Lucknow: ['Hazratganj', 'Gomti Nagar', 'Aliganj', 'Indira Nagar', 'Aminabad', 'Alambagh', 'Mahanagar'],
};

export const VEHICLE_MODELS = [
  'Ather 450X', 'Ather Rizta', 'Bajaj Chetak', 'Bajaj Platina', 'Bajaj Pulsar', 'Hero Electric Optima', 'Hero HF Deluxe',
  'Hero Passion Pro', 'Hero Splendor Plus', 'Hero Super Splendor', 'Honda Activa', 'Honda Dio', 'Honda Shine',
  'Honda SP 125', 'Honda Unicorn', 'Okinawa Praise', 'Ola S1 Air', 'Ola S1 Pro', 'Revolt RV400', 'Royal Enfield Classic 350',
  'Suzuki Access 125', 'Suzuki Burgman Street', 'TVS Apache', 'TVS iQube', 'TVS Jupiter', 'TVS Ntorq 125',
  'TVS Raider 125', 'TVS XL100', 'Yamaha FZ', 'Yamaha Fascino', 'Yamaha RayZR', 'Bicycle', 'Electric Cycle',
];

/** Case-insensitive matches: names starting with the query first, then names containing it. */
export function matchSuggestions(list, query, limit = 6) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const item of list) {
    const lower = item.toLowerCase();
    if (lower === q) continue;
    if (lower.startsWith(q) || lower.split(/[\s(]+/).some((w) => w.startsWith(q))) starts.push(item);
    else if (lower.includes(q)) contains.push(item);
  }
  return starts.concat(contains).slice(0, limit);
}

/** Areas for the chosen city, or every known area (tagged with its city) if the city isn't listed. */
export function areaSuggestionsFor(city) {
  const key = Object.keys(AREAS).find((c) => c.toLowerCase() === (city || '').trim().toLowerCase());
  if (key) return AREAS[key];
  return Object.entries(AREAS).flatMap(([c, areas]) => areas.map((a) => `${a}, ${c}`));
}

// Same formats the backend accepts: HR26DK8337, DL3C1234, 22BH1234AA.
export function normalizeVehicleNumber(value) {
  return (value || '').replace(/[\s\-.]/g, '').toUpperCase();
}

export function isValidVehicleNumber(value) {
  const v = normalizeVehicleNumber(value);
  return /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(v) || /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/.test(v);
}
