// English / Hindi for the rider app. The choice is saved on the phone. Strings not listed here stay in
// English (server messages, campaign content, older screens).
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sr_language';

const HI = {
  'Ride. Advertise. Earn.': 'राइड करें। विज्ञापन करें। कमाएँ।',
  Skip: 'छोड़ें',
  Next: 'आगे',
  'Get Started': 'शुरू करें',
  'Discover Campaigns Near You': 'अपने पास कैंपेन खोजें',
  'Browse high-paying local brand advertisements. Choose routes that match your daily commute and start earning instantly.':
    'अच्छी कमाई वाले स्थानीय ब्रांड विज्ञापन देखें। अपने रोज़ के रास्ते से मेल खाने वाले रूट चुनें और कमाई शुरू करें।',
  'Ride With Brand Gear': 'ब्रांड गियर के साथ राइड करें',
  'Wear the campaign T-shirt, ride your usual routes and upload three quick photos a day.':
    'कैंपेन टी-शर्ट पहनें, अपने सामान्य रास्तों पर राइड करें और दिन में तीन फ़ोटो अपलोड करें।',
  'Get Paid For Every Approved Day': 'हर स्वीकृत दिन का भुगतान पाएँ',
  'Track your streaks and earnings in one place. Payouts go straight to your UPI.':
    'अपनी स्ट्रीक और कमाई एक जगह देखें। भुगतान सीधे आपके UPI में।',
  'Choose Your Language': 'अपनी भाषा चुनें',
  'Default language': 'डिफ़ॉल्ट भाषा',
  Continue: 'जारी रखें',
  'How would you like to use FlexRiders?': 'आप FlexRiders का उपयोग कैसे करना चाहेंगे?',
  'Select your profile type to proceed with registration.': 'आगे बढ़ने के लिए अपना प्रोफ़ाइल प्रकार चुनें।',
  'Continue as Rider': 'राइडर के रूप में जारी रखें',
  'Ride daily, carry brand campaigns and earn for every approved day.': 'रोज़ राइड करें, ब्रांड कैंपेन चलाएँ और हर स्वीकृत दिन कमाएँ।',
  'Continue as Brand': 'ब्रांड के रूप में जारी रखें',
  'Launch hyper-local campaigns with verified riders.': 'सत्यापित राइडर्स के साथ स्थानीय कैंपेन चलाएँ।',
  'Next Step': 'अगला कदम',
  'Welcome Back': 'वापसी पर स्वागत है',
  'Sign in to manage your active campaigns & payouts.': 'अपने कैंपेन और भुगतान देखने के लिए साइन इन करें।',
  'Email or Mobile Number': 'ईमेल या मोबाइल नंबर',
  Password: 'पासवर्ड',
  Show: 'दिखाएँ',
  Hide: 'छिपाएँ',
  'Forgot Password?': 'पासवर्ड भूल गए?',
  Login: 'लॉगिन',
  or: 'या',
  'New here?': 'नए हैं?',
  'Sign Up': 'साइन अप',
  'Create Account': 'खाता बनाएँ',
  'Register as a rider to unlock active campaigns.': 'कैंपेन देखने के लिए राइडर के रूप में रजिस्टर करें।',
  'Mobile Number': 'मोबाइल नंबर',
  'Email Address': 'ईमेल पता',
  OPTIONAL: 'वैकल्पिक',
  'Create Password': 'पासवर्ड बनाएँ',
  'Already have an account?': 'पहले से खाता है?',
  'Verify Your Email': 'अपना ईमेल सत्यापित करें',
  'Verify Your Number': 'अपना नंबर सत्यापित करें',
  Verify: 'सत्यापित करें',
  'Complete Your Profile': 'अपनी प्रोफ़ाइल पूरी करें',
  'Full Name': 'पूरा नाम',
  'Phone Number': 'फ़ोन नंबर',
  'Date of Birth': 'जन्म तिथि',
  Gender: 'लिंग',
  'Save & Continue': 'सेव करें और जारी रखें',
  'Verify Your Identity': 'अपनी पहचान सत्यापित करें',
  'Document Type': 'दस्तावेज़ का प्रकार',
  'Upload Document Scan': 'दस्तावेज़ अपलोड करें',
  'Add Your Vehicle': 'अपना वाहन जोड़ें',
  'Select Vehicle Type': 'वाहन का प्रकार चुनें',
  'Vehicle Model': 'वाहन मॉडल',
  'Vehicle Verification': 'वाहन सत्यापन',
  'Select Working Areas': 'काम के क्षेत्र चुनें',
  'Save & Proceed': 'सेव करें और आगे बढ़ें',
  'Enable Location Access': 'लोकेशन एक्सेस चालू करें',
  'Allow Location': 'लोकेशन की अनुमति दें',
  'Not Now': 'अभी नहीं',
  Home: 'होम',
  Campaigns: 'कैंपेन',
  Earnings: 'कमाई',
  You: 'आप',
  Personal: 'व्यक्तिगत',
  'Personal Information': 'व्यक्तिगत जानकारी',
  'Verification Status': 'सत्यापन स्थिति',
  'My Vehicle': 'मेरा वाहन',
  'Working Areas': 'काम के क्षेत्र',
  Payments: 'भुगतान',
  'Payment / UPI Details': 'भुगतान / UPI विवरण',
  Campaign: 'कैंपेन',
  'Campaign T-Shirts': 'कैंपेन टी-शर्ट',
  'Refer & Earn': 'रेफ़र करें और कमाएँ',
  'App Settings': 'ऐप सेटिंग्स',
  Notifications: 'सूचनाएँ',
  Language: 'भाषा',
  'Help & Support': 'सहायता',
  Logout: 'लॉग आउट',
  'Map View': 'मैप व्यू',
  'List View': 'लिस्ट व्यू',
  'Near You': 'आपके पास',
  'Opening Soon': 'जल्द शुरू',
  'My Areas': 'मेरे क्षेत्र',
  Recenter: 'केंद्र पर लाएँ',
  'Join Campaign': 'कैंपेन जॉइन करें',
  'Withdraw Request': 'अनुरोध वापस लें',
  'Daily Activity': 'दैनिक गतिविधि',
  'Upload Photo': 'फ़ोटो अपलोड करें',
  'Withdraw Earnings': 'कमाई निकालें',
  'Total Earned': 'कुल कमाई',
  'Share Invite Link': 'आमंत्रण लिंक साझा करें',
  'Clear All': 'सब हटाएँ',
};

const LanguageContext = createContext({ lang: 'en', setLang: () => {}, t: (s) => s });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('en');
  const [chosen, setChosen] = useState(null); // null until loaded; false = never chosen
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'en' || v === 'hi') setLangState(v);
        setChosen(v === 'en' || v === 'hi');
      })
      .catch(() => setChosen(false));
  }, []);
  const value = useMemo(
    () => ({
      lang,
      chosen,
      setLang: (v) => {
        setLangState(v);
        setChosen(true);
        AsyncStorage.setItem(KEY, v).catch(() => {});
      },
      t: (s) => (lang === 'hi' && HI[s]) || s,
    }),
    [lang, chosen]
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useT = () => useContext(LanguageContext);
