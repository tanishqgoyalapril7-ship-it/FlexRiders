import { IconCheck } from "@/components/Icons";
import MagneticButton from "@/components/MagneticButton";
import { Reveal, RevealHeading } from "@/components/Reveal";
import s from "./HowItWorks.module.css";

const business = [
  ["Submit an enquiry", "Tell us about your brand using the enquiry form."],
  ["Share brand & promotion requirements", "What you want to promote, your target area and timing."],
  ["Plan the campaign", "Agree the duration, campaign area and budget with our team."],
  ["Select riders / vehicles", "Choose the vehicle types and number of riders for the campaign."],
  ["Launch the campaign", "The campaign goes live and approved, eligible riders take part."],
  ["Track campaign activity", "Campaign photos and activity are tracked through FlexRiders."],
];

// Mirrors the rider app's actual sign-up: there is no OTP step (riders register with mobile number and password).
const riders = [
  ["Register", "Download the app and start with your mobile number and a password."],
  ["Profile details", "Add your work, vehicle, area and payout details."],
  ["Accept Terms & Privacy", "Read and accept the FlexRiders Terms & Conditions and Privacy Policy."],
  ["Driver selfie", "Take a selfie with the front camera to complete your registration."],
  ["Admin approval", "The FlexRiders team reviews your profile; features unlock once approved."],
  ["Discover eligible campaigns", "Approved riders see the campaigns that match their vehicle."],
  ["Join a campaign", "Join an eligible campaign while joining is open."],
  ["Complete campaign activities", "Do the required activities and submit the Morning, Evening and Night photos."],
  ["Track earnings", "Eligible completed campaign days show in your earnings, as per the campaign rules."],
];

const riderDuties = [
  "Take part in approved campaigns",
  "Follow campaign instructions",
  "Cover the assigned or eligible areas",
  "Complete the required daily activities",
  "Submit the required campaign photos",
  "Follow campaign timings and guidelines",
  "Stay within campaign rules",
];

function Steps({ items, label }: { items: string[][]; label: string }) {
  return (
    <ol className={s.steps} aria-label={label}>
      {items.map(([title, text], i) => (
        <li key={title} className={s.step}>
          <span className={s.n}>{i + 1}</span>
          <div>
            <h4 className={s.stepTitle}>{title}</h4>
            <p className={s.stepText}>{text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** How FlexRiders works, for businesses and for riders. */
export default function HowItWorks() {
  return (
    <section id="how-it-works" className="section theme-light theme-paper" aria-labelledby="how-title">
      <div className="container">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">How it works</p>
          </Reveal>
          <RevealHeading id="how-title" className="display" lines={["Brands and riders,", <span key="b" className="blue-text">one campaign.</span>]} />
        </div>

        <div className={s.tracks}>
          <Reveal className={s.track}>
            <p className={s.kicker}>For businesses</p>
            <h3 className={s.trackTitle}>How it works for businesses</h3>
            <Steps items={business} label="Steps for businesses" />
            <MagneticButton href="#enquiry" arrow className={s.cta}>
              Submit an Enquiry
            </MagneticButton>
          </Reveal>

          <Reveal delay={0.1} className={s.track}>
            <p className={s.kicker}>For riders</p>
            <h3 className={s.trackTitle}>How riders become part of FlexRiders</h3>
            <Steps items={riders} label="Steps for riders" />
            <p className={s.quote}>
              “Your profile is currently under review. Further FlexRiders features will become available once your profile is approved.”
              <span>What new riders see while the team reviews their profile.</span>
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.1} className={s.duties}>
          <h3 className={s.trackTitle}>What riders do</h3>
          <ul className={s.dutyList}>
            {riderDuties.map((d) => (
              <li key={d}>
                <IconCheck size={16} />
                {d}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
